import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  events,
  formFields,
  orders,
  refunds,
  ticketTypes,
  tickets,
  type FormField,
} from "@/db/schema";
import { computeAvailability, heldByType, registrationState } from "./availability";
import { newOrderNumber, newQrToken, newTicketCode } from "./codes";

export const HOLD_MINUTES = 15;

export class OrderError extends Error {}

export const attendeeSchema = z.object({
  ticketTypeId: z.string().min(1),
  name: z.string().trim().min(2, "Enter the full name").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{7,16}$/, "Enter a valid phone number"),
  organization: z.string().trim().max(160).optional().default(""),
  answers: z.record(z.string(), z.union([z.string(), z.boolean()])).default({}),
});

export const createOrderSchema = z.object({
  eventId: z.string().min(1),
  attendees: z.array(attendeeSchema).min(1),
});

export type CreateOrderInput = z.input<typeof createOrderSchema>;

/** Validate and normalise custom-field answers against the event's form. */
export function validateAnswers(
  fields: FormField[],
  answers: Record<string, string | boolean>,
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const f of fields) {
    const raw = answers[f.key];
    if (f.type === "CHECKBOX") {
      const checked = raw === true || raw === "true";
      if (f.required && !checked) throw new OrderError(`"${f.label}" must be ticked`);
      out[f.key] = checked;
      continue;
    }
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) {
      if (f.required) throw new OrderError(`"${f.label}" is required`);
      continue;
    }
    if (value.length > 2000) throw new OrderError(`"${f.label}" is too long`);
    if (f.type === "NUMBER" && !Number.isFinite(Number(value))) {
      throw new OrderError(`"${f.label}" must be a number`);
    }
    if (f.type === "SELECT" && !f.options.includes(value)) {
      throw new OrderError(`"${f.label}" has an invalid choice`);
    }
    out[f.key] = value;
  }
  return out;
}

/**
 * Reserve seats and create a pending order. Runs under a row lock on the
 * event so two buyers can never both take the last seat.
 * Free orders are confirmed immediately.
 */
export async function createOrder(
  user: { id: string },
  rawInput: CreateOrderInput,
  now = new Date(),
  /**
   * offline: an organiser is registering someone who paid in person. The
   * order is confirmed at once at the offline price, and the registration
   * window is not enforced (walk-ins on the day), but capacity still is.
   */
  opts: { offline?: boolean } = {},
) {
  const parsed = createOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new OrderError(parsed.error.issues[0]?.message ?? "Invalid registration details");
  }
  const input = parsed.data;

  return db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, input.eventId))
      .for("update");
    if (!event) throw new OrderError("Event not found");

    const state = registrationState(event, now);
    if (opts.offline) {
      if (event.status === "CANCELLED") throw new OrderError("This event has been cancelled.");
    } else if (!state.open) {
      throw new OrderError(state.reason);
    }
    if (!opts.offline && input.attendees.length > event.maxTicketsPerOrder) {
      throw new OrderError(
        `You can register at most ${event.maxTicketsPerOrder} ticket(s) per order`,
      );
    }

    const types = await tx.select().from(ticketTypes).where(eq(ticketTypes.eventId, event.id));
    const typeById = new Map(types.map((t) => [t.id, t]));
    const fields = await tx.select().from(formFields).where(eq(formFields.eventId, event.id));

    // Release this user's earlier unpaid holds for the event before counting.
    if (!opts.offline) await tx
      .update(orders)
      .set({ status: "EXPIRED" })
      .where(
        and(
          eq(orders.eventId, event.id),
          eq(orders.userId, user.id),
          eq(orders.status, "PENDING"),
        ),
      );

    const held = await heldByType(tx, event.id, { now });
    const availability = computeAvailability(event, types, held);

    const wanted = new Map<string, number>();
    for (const a of input.attendees) {
      const type = typeById.get(a.ticketTypeId);
      if (!type || !type.active) throw new OrderError("That ticket type is not available");
      wanted.set(type.id, (wanted.get(type.id) ?? 0) + 1);
    }
    if (
      availability.eventRemaining != null &&
      input.attendees.length > availability.eventRemaining
    ) {
      throw new OrderError(
        availability.eventRemaining === 0
          ? "This event is sold out"
          : `Only ${availability.eventRemaining} seat(s) left`,
      );
    }
    for (const [typeId, qty] of wanted) {
      const left = availability.byType[typeId];
      if (left != null && qty > left) {
        const name = typeById.get(typeId)!.name;
        throw new OrderError(left === 0 ? `${name} is sold out` : `Only ${left} left for ${name}`);
      }
    }

    const rows = input.attendees.map((a) => {
      const type = typeById.get(a.ticketTypeId)!;
      return {
        type,
        attendee: a,
        answers: validateAnswers(fields, a.answers),
        pricePaise: opts.offline ? (type.offlinePricePaise ?? type.pricePaise) : type.pricePaise,
      };
    });
    const amountPaise = rows.reduce((sum, r) => sum + r.pricePaise, 0);
    // Offline money is already in hand, so the order is confirmed like a free one.
    const isFree = amountPaise === 0 || Boolean(opts.offline);
    const buyer = input.attendees[0];
    const orderNumber = newOrderNumber();

    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber,
        paymentMethod: opts.offline ? "OFFLINE" : "ONLINE",
        // A marker instead of a gateway id, so refunds know there is nothing to send to Razorpay.
        razorpayPaymentId: opts.offline && amountPaise > 0 ? `offline_${orderNumber}` : null,
        eventId: event.id,
        userId: user.id,
        buyerName: buyer.name,
        buyerEmail: buyer.email,
        buyerPhone: buyer.phone,
        amountPaise,
        status: isFree ? "PAID" : "PENDING",
        paidAt: isFree ? now : null,
        expiresAt: new Date(now.getTime() + HOLD_MINUTES * 60_000),
      })
      .returning();

    await tx.insert(tickets).values(
      rows.map((r) => ({
        orderId: order.id,
        eventId: event.id,
        ticketTypeId: r.type.id,
        ticketCode: newTicketCode(),
        qrToken: newQrToken(),
        attendeeName: r.attendee.name,
        attendeeEmail: r.attendee.email,
        attendeePhone: r.attendee.phone,
        organization: r.attendee.organization || null,
        answers: r.answers,
        pricePaise: r.pricePaise,
        status: isFree ? ("VALID" as const) : ("RESERVED" as const),
      })),
    );

    return order;
  });
}

export type FulfillResult =
  | { outcome: "fulfilled" | "already_paid" }
  /** Payment arrived after the hold lapsed and the seats were taken. */
  | { outcome: "refund_required"; amountPaise: number }
  | { outcome: "not_found" | "not_payable" };

/**
 * Confirm a paid order. Idempotent: the checkout callback and the webhook
 * both call this, in either order, any number of times.
 */
export async function fulfillOrder(
  orderId: string,
  paymentId: string,
  now = new Date(),
): Promise<FulfillResult> {
  const [peek] = await db
    .select({ eventId: orders.eventId })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!peek) return { outcome: "not_found" };

  return db.transaction(async (tx) => {
    // Same lock order as createOrder: event first, then order.
    const [event] = await tx.select().from(events).where(eq(events.id, peek.eventId)).for("update");
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order || !event) return { outcome: "not_found" };

    if (order.status === "PAID") return { outcome: "already_paid" };
    if (order.status !== "PENDING" && order.status !== "EXPIRED" && order.status !== "FAILED") {
      return { outcome: "not_payable" };
    }

    const holdIsLive = order.status === "PENDING" && order.expiresAt > now;
    if (!holdIsLive) {
      // The seats may have gone to someone else; check again without our own tickets.
      const own = await tx.select().from(tickets).where(eq(tickets.orderId, order.id));
      const types = await tx.select().from(ticketTypes).where(eq(ticketTypes.eventId, event.id));
      const held = await heldByType(tx, event.id, { now, excludeOrderId: order.id });
      const availability = computeAvailability(event, types, held);
      const wanted = new Map<string, number>();
      for (const t of own) wanted.set(t.ticketTypeId, (wanted.get(t.ticketTypeId) ?? 0) + 1);
      const fits =
        (availability.eventRemaining == null || own.length <= availability.eventRemaining) &&
        [...wanted].every(([typeId, qty]) => {
          const left = availability.byType[typeId];
          return left == null || qty <= left;
        });
      if (!fits) {
        await tx
          .update(orders)
          .set({ status: "REFUNDED", razorpayPaymentId: paymentId, paidAt: now })
          .where(eq(orders.id, order.id));
        await tx.update(tickets).set({ status: "CANCELLED" }).where(eq(tickets.orderId, order.id));
        return { outcome: "refund_required", amountPaise: order.amountPaise };
      }
    }

    await tx
      .update(orders)
      .set({ status: "PAID", razorpayPaymentId: paymentId, paidAt: now })
      .where(eq(orders.id, order.id));
    await tx
      .update(tickets)
      .set({ status: "VALID" })
      .where(and(eq(tickets.orderId, order.id), eq(tickets.status, "RESERVED")));
    return { outcome: "fulfilled" };
  });
}

export async function markOrderFailed(orderId: string) {
  await db
    .update(orders)
    .set({ status: "FAILED" })
    .where(and(eq(orders.id, orderId), eq(orders.status, "PENDING")));
}

export type CancelResult = {
  refundIds: string[];
  amountPaise: number;
  paymentId: string | null;
};

/**
 * Cancel valid tickets on a paid order and record a pending refund per paid
 * ticket. The caller then sends each refund to Razorpay (see refunds.ts).
 */
export async function cancelTickets(
  orderId: string,
  ticketIds: string[],
  reason?: string,
): Promise<CancelResult> {
  if (ticketIds.length === 0) throw new OrderError("Select at least one ticket");
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) throw new OrderError("Order not found");
    if (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED") {
      throw new OrderError("Only paid orders can be cancelled");
    }
    const target = await tx
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.orderId, orderId),
          inArray(tickets.id, ticketIds),
          eq(tickets.status, "VALID"),
        ),
      );
    if (target.length !== ticketIds.length) {
      throw new OrderError("Some tickets are already cancelled or do not belong to this order");
    }

    await tx
      .update(tickets)
      .set({ status: "CANCELLED" })
      .where(inArray(tickets.id, ticketIds));

    const paid = target.filter((t) => t.pricePaise > 0);
    const inserted = paid.length
      ? await tx
          .insert(refunds)
          .values(
            paid.map((t) => ({
              orderId,
              ticketId: t.id,
              amountPaise: t.pricePaise,
              reason: reason?.trim() || null,
            })),
          )
          .returning({ id: refunds.id })
      : [];

    const stillValid = await tx
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.orderId, orderId), eq(tickets.status, "VALID")));
    await tx
      .update(orders)
      .set({ status: stillValid.length === 0 ? "REFUNDED" : "PARTIALLY_REFUNDED" })
      .where(eq(orders.id, orderId));

    return {
      refundIds: inserted.map((r) => r.id),
      amountPaise: paid.reduce((s, t) => s + t.pricePaise, 0),
      paymentId: order.razorpayPaymentId,
    };
  });
}

export type CheckInResult =
  | { result: "checked_in"; ticketId: string }
  | { result: "already_checked_in"; ticketId: string; at: Date }
  | { result: "cancelled" | "not_paid" | "wrong_event"; ticketId: string }
  | { result: "not_found" };

/** Check a ticket in by QR token or ticket code. Single-use and race-safe. */
export async function checkIn(
  eventId: string,
  tokenOrCode: string,
  adminId: string,
  now = new Date(),
): Promise<CheckInResult> {
  const value = tokenOrCode.trim();
  if (!value) return { result: "not_found" };
  const code = value.toUpperCase();
  const ticket = await db.query.tickets.findFirst({
    where: (t, { or, eq }) => or(eq(t.qrToken, value), eq(t.ticketCode, code)),
  });
  if (!ticket) return { result: "not_found" };
  if (ticket.eventId !== eventId) return { result: "wrong_event", ticketId: ticket.id };

  // The WHERE clause makes this atomic: only one concurrent scan can win.
  const updated = await db
    .update(tickets)
    .set({ checkedInAt: now, checkedInById: adminId })
    .where(
      and(eq(tickets.id, ticket.id), eq(tickets.status, "VALID"), isNull(tickets.checkedInAt)),
    )
    .returning({ id: tickets.id });
  if (updated.length === 1) return { result: "checked_in", ticketId: ticket.id };

  const [fresh] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
  if (fresh.status === "CANCELLED") return { result: "cancelled", ticketId: ticket.id };
  if (fresh.status === "RESERVED") return { result: "not_paid", ticketId: ticket.id };
  return { result: "already_checked_in", ticketId: ticket.id, at: fresh.checkedInAt ?? now };
}

export async function undoCheckIn(ticketId: string) {
  await db
    .update(tickets)
    .set({ checkedInAt: null, checkedInById: null })
    .where(eq(tickets.id, ticketId));
}
