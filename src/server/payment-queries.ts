import "server-only";
import { and, count, desc, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, orders, refunds } from "@/db/schema";

export type PaymentFilters = {
  q?: string;
  event?: string;
  /** received (default) | refunded | unpaid | all */
  status?: string;
  /** online | offline */
  method?: string;
};

const RECEIVED = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

function where(f: PaymentFilters) {
  const q = f.q?.trim();
  const like = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : null;
  return and(
    f.event ? eq(orders.eventId, f.event) : undefined,
    f.method === "online"
      ? eq(orders.paymentMethod, "ONLINE")
      : f.method === "offline"
        ? eq(orders.paymentMethod, "OFFLINE")
        : undefined,
    f.status === "all"
      ? undefined
      : f.status === "refunded"
        ? inArray(orders.status, ["PARTIALLY_REFUNDED", "REFUNDED"])
        : f.status === "unpaid"
          ? inArray(orders.status, ["PENDING", "EXPIRED", "FAILED"])
          : // Money actually received: paid orders, leaving out free ones.
            and(inArray(orders.status, [...RECEIVED]), gt(orders.amountPaise, 0)),
    like
      ? or(
          ilike(orders.orderNumber, like),
          ilike(orders.buyerName, like),
          ilike(orders.buyerEmail, like),
          ilike(orders.buyerPhone, like),
          ilike(orders.razorpayPaymentId, like),
          ilike(orders.razorpayOrderId, like),
        )
      : undefined,
  );
}

/** Refunds sent or on their way, per order. Failed refunds have not returned any money. */
const refundedPaise = sql<number>`coalesce((
  select sum(${refunds.amountPaise}) from ${refunds}
  where ${refunds.orderId} = ${orders.id} and ${refunds.status} in ('PENDING', 'PROCESSED')
), 0)::bigint`.mapWith(Number);

const ticketCount = sql<number>`(select count(*) from tickets where tickets.order_id = ${orders.id})::int`;

export async function listPayments(filters: PaymentFilters, page: { limit: number; offset: number } | null) {
  const base = db
    .select({
      order: orders,
      eventTitle: events.title,
      timezone: events.timezone,
      refundedPaise,
      tickets: ticketCount,
    })
    .from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(where(filters))
    .orderBy(desc(sql`coalesce(${orders.paidAt}, ${orders.createdAt})`));
  const rows = page ? await base.limit(page.limit).offset(page.offset) : await base;
  const [{ total }] = await db.select({ total: count() }).from(orders).where(where(filters));
  return { rows, total };
}

export type PaymentRow = Awaited<ReturnType<typeof listPayments>>["rows"][number];

/** Totals for the same filters, counting only orders where money was received. */
export async function paymentTotals(filters: PaymentFilters) {
  const received = and(where(filters), inArray(orders.status, [...RECEIVED]));
  const [t] = await db
    .select({
      payments: sql<number>`count(*) filter (where ${orders.amountPaise} > 0)::int`,
      collectedPaise: sql<number>`coalesce(sum(${orders.amountPaise}), 0)::bigint`.mapWith(Number),
      onlinePaise: sql<number>`coalesce(sum(${orders.amountPaise}) filter (where ${orders.paymentMethod} = 'ONLINE'), 0)::bigint`.mapWith(Number),
      offlinePaise: sql<number>`coalesce(sum(${orders.amountPaise}) filter (where ${orders.paymentMethod} = 'OFFLINE'), 0)::bigint`.mapWith(Number),
      refundedPaise: sql<number>`coalesce(sum(${refundedPaise}), 0)::bigint`.mapWith(Number),
    })
    .from(orders)
    .where(received);
  return { ...t, netPaise: t.collectedPaise - t.refundedPaise };
}
