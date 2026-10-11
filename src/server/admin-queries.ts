import "server-only";
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { events, orders, refunds, ticketTypes, tickets } from "@/db/schema";

export type EventStats = {
  sold: number;
  checkedIn: number;
  cancelled: number;
  revenuePaise: number;
  refundedPaise: number;
};

/** Per-event totals. Revenue counts valid tickets only, so refunds are already excluded. */
export async function statsByEvent(eventIds?: string[]): Promise<Map<string, EventStats>> {
  const scope = eventIds ? inArray(tickets.eventId, eventIds) : undefined;
  const rows = await db
    .select({
      eventId: tickets.eventId,
      sold: sql<number>`count(*) filter (where ${tickets.status} = 'VALID')::int`,
      checkedIn: sql<number>`count(*) filter (where ${tickets.status} = 'VALID' and ${tickets.checkedInAt} is not null)::int`,
      cancelled: sql<number>`count(*) filter (where ${tickets.status} = 'CANCELLED')::int`,
      // Summed as a 64-bit number: a 32-bit total overflows a little above ₹2 crore.
      revenuePaise: sql<number>`coalesce(sum(${tickets.pricePaise}) filter (where ${tickets.status} = 'VALID'), 0)::bigint`.mapWith(Number),
    })
    .from(tickets)
    .where(scope)
    .groupBy(tickets.eventId);

  const refundRows = await db
    .select({ eventId: orders.eventId, total: sum(refunds.amountPaise) })
    .from(refunds)
    .innerJoin(orders, eq(refunds.orderId, orders.id))
    .where(inArray(refunds.status, ["PENDING", "PROCESSED"]))
    .groupBy(orders.eventId);
  const refunded = new Map(refundRows.map((r) => [r.eventId, Number(r.total ?? 0)]));

  return new Map(
    rows.map((r) => [r.eventId, { ...r, refundedPaise: refunded.get(r.eventId) ?? 0 }]),
  );
}

export const emptyStats: EventStats = {
  sold: 0,
  checkedIn: 0,
  cancelled: 0,
  revenuePaise: 0,
  refundedPaise: 0,
};

export type RegistrationFilters = {
  q?: string;
  type?: string;
  status?: string;
  checkin?: string;
};

function registrationWhere(eventId: string, f: RegistrationFilters) {
  const q = f.q?.trim();
  const like = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : null;
  return and(
    eq(tickets.eventId, eventId),
    f.type ? eq(tickets.ticketTypeId, f.type) : undefined,
    f.status === "valid"
      ? eq(tickets.status, "VALID")
      : f.status === "cancelled"
        ? eq(tickets.status, "CANCELLED")
        : f.status === "unpaid"
          ? eq(tickets.status, "RESERVED")
          : // Unpaid holds are hidden unless asked for.
            inArray(tickets.status, ["VALID", "CANCELLED"]),
    f.checkin === "yes"
      ? isNotNull(tickets.checkedInAt)
      : f.checkin === "no"
        ? and(isNull(tickets.checkedInAt), eq(tickets.status, "VALID"))
        : undefined,
    like
      ? or(
          ilike(tickets.attendeeName, like),
          ilike(tickets.attendeeEmail, like),
          ilike(tickets.attendeePhone, like),
          ilike(tickets.ticketCode, like),
          ilike(tickets.organization, like),
          ilike(orders.orderNumber, like),
          ilike(orders.buyerEmail, like),
        )
      : undefined,
  );
}

const registrationColumns = {
  ticket: tickets,
  typeName: ticketTypes.name,
  orderNumber: orders.orderNumber,
  orderStatus: orders.status,
  paymentMethod: orders.paymentMethod,
  buyerEmail: orders.buyerEmail,
  paymentId: orders.razorpayPaymentId,
  paidAt: orders.paidAt,
};

export async function listRegistrations(
  eventId: string,
  filters: RegistrationFilters,
  page: { limit: number; offset: number } | null,
) {
  const where = registrationWhere(eventId, filters);
  const base = db
    .select(registrationColumns)
    .from(tickets)
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .where(where)
    .orderBy(desc(tickets.createdAt));
  const rows = page ? await base.limit(page.limit).offset(page.offset) : await base;
  const [{ total }] = await db
    .select({ total: count() })
    .from(tickets)
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .where(where);
  return { rows, total };
}

export type RegistrationRow = Awaited<ReturnType<typeof listRegistrations>>["rows"][number];

/**
 * Refunds that need an organiser's attention: Razorpay rejected them, or they
 * were recorded but never sent (for example the server stopped mid-way).
 */
export async function failedRefunds(eventId: string) {
  const stuckBefore = new Date(Date.now() - 5 * 60_000);
  return db
    .select({ refund: refunds, orderNumber: orders.orderNumber })
    .from(refunds)
    .innerJoin(orders, eq(refunds.orderId, orders.id))
    .where(
      and(
        eq(orders.eventId, eventId),
        or(
          eq(refunds.status, "FAILED"),
          and(
            eq(refunds.status, "PENDING"),
            isNull(refunds.razorpayRefundId),
            lt(refunds.createdAt, stuckBefore),
          ),
        ),
      ),
    );
}

export async function listEventsWithStats() {
  const all = await db.select().from(events).orderBy(desc(events.startsAt));
  const stats = await statsByEvent();
  return all.map((e) => ({ event: e, stats: stats.get(e.id) ?? emptyStats }));
}
