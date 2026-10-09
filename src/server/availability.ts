import { and, count, eq, gt, ne, or } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db";
import { events, orders, ticketTypes, tickets, type Event, type TicketType } from "@/db/schema";

/**
 * Seats currently taken per ticket type: valid tickets plus tickets held by
 * an unexpired pending order. Expired holds simply stop counting.
 */
export async function heldByType(
  conn: Db | Tx,
  eventId: string,
  opts: { now?: Date; excludeOrderId?: string } = {},
): Promise<Map<string, number>> {
  const now = opts.now ?? new Date();
  const rows = await conn
    .select({ ticketTypeId: tickets.ticketTypeId, n: count() })
    .from(tickets)
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .where(
      and(
        eq(tickets.eventId, eventId),
        opts.excludeOrderId ? ne(orders.id, opts.excludeOrderId) : undefined,
        or(
          eq(tickets.status, "VALID"),
          and(
            eq(tickets.status, "RESERVED"),
            eq(orders.status, "PENDING"),
            gt(orders.expiresAt, now),
          ),
        ),
      ),
    )
    .groupBy(tickets.ticketTypeId);
  return new Map(rows.map((r) => [r.ticketTypeId, r.n]));
}

export type Availability = {
  /** Seats left for the whole event, or null when uncapped. */
  eventRemaining: number | null;
  /** Seats left per ticket type, already limited by the event cap. null = unlimited. */
  byType: Record<string, number | null>;
};

export function computeAvailability(
  event: Pick<Event, "capacity">,
  types: Pick<TicketType, "id" | "quota">[],
  held: Map<string, number>,
): Availability {
  const totalHeld = [...held.values()].reduce((a, b) => a + b, 0);
  const eventRemaining =
    event.capacity == null ? null : Math.max(0, event.capacity - totalHeld);
  const byType: Availability["byType"] = {};
  for (const t of types) {
    const typeRemaining = t.quota == null ? null : Math.max(0, t.quota - (held.get(t.id) ?? 0));
    byType[t.id] =
      typeRemaining == null
        ? eventRemaining
        : eventRemaining == null
          ? typeRemaining
          : Math.min(typeRemaining, eventRemaining);
  }
  return { eventRemaining, byType };
}

export async function getAvailability(eventId: string): Promise<Availability> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) return { eventRemaining: 0, byType: {} };
  const types = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
  return computeAvailability(event, types, await heldByType(db, eventId));
}

export type RegistrationState =
  | { open: true }
  | { open: false; reason: string };

export function registrationState(event: Event, now = new Date()): RegistrationState {
  if (event.status === "DRAFT") return { open: false, reason: "This event is not published yet." };
  if (event.status === "CANCELLED") return { open: false, reason: "This event has been cancelled." };
  if (event.status === "CLOSED") return { open: false, reason: "Registration is closed." };
  if (event.registrationOpensAt && now < event.registrationOpensAt) {
    return { open: false, reason: "Registration has not opened yet." };
  }
  const closesAt = event.registrationClosesAt ?? event.endsAt;
  if (now > closesAt) return { open: false, reason: "Registration is closed." };
  return { open: true };
}
