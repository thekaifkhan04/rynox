import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Razorpay itself is replaced by a stand-in that records what it was asked to do.
const gateway = vi.hoisted(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  return { created: 0, refunded: [] as string[] };
});
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/razorpay", async (original) => ({
  ...(await original<typeof import("@/lib/razorpay")>()),
  razorpay: () => ({
    orders: {
      create: async () => {
        // Slow enough for two callers to overlap.
        await new Promise((r) => setTimeout(r, 30));
        return { id: `order_${++gateway.created}` };
      },
    },
    payments: {
      refund: async (paymentId: string) => {
        gateway.refunded.push(paymentId);
        return { id: `rfnd_${gateway.refunded.length}`, status: "processed" };
      },
    },
  }),
}));

import { db } from "@/db";
import { orders, refunds } from "@/db/schema";
import { createOrder } from "@/server/orders";
import { ensureRazorpayOrder, processRefunds } from "@/server/payments";
import { attendee, makeEvent, makeUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  gateway.created = 0;
  gateway.refunded = [];
});

async function pendingOrder() {
  const { event, types } = await makeEvent();
  return createOrder(await makeUser(), { eventId: event.id, attendees: [attendee(types[0].id)] });
}

describe("ensureRazorpayOrder", () => {
  it("gives every caller the same gateway order when two tabs start paying together", async () => {
    const order = await pendingOrder();
    const ids = await Promise.all([
      ensureRazorpayOrder(order.id),
      ensureRazorpayOrder(order.id),
      ensureRazorpayOrder(order.id),
    ]);
    expect(new Set(ids).size).toBe(1);
    const [saved] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(saved.razorpayOrderId).toBe(ids[0]);

    // Later calls reuse it without asking the gateway again.
    const before = gateway.created;
    expect(await ensureRazorpayOrder(order.id)).toBe(ids[0]);
    expect(gateway.created).toBe(before);
  });
});

describe("processRefunds", () => {
  it("never sends a refund that the gateway already has", async () => {
    const order = await pendingOrder();
    await db.update(orders).set({ status: "PAID", razorpayPaymentId: "pay_real" }).where(eq(orders.id, order.id));
    const [sent, fresh] = await db
      .insert(refunds)
      .values([
        { orderId: order.id, amountPaise: 100, razorpayRefundId: "rfnd_existing" },
        { orderId: order.id, amountPaise: 200 },
      ])
      .returning();

    await processRefunds([sent.id, fresh.id]);
    await processRefunds([sent.id, fresh.id]);

    // Only the unsent refund went out, and only once.
    expect(gateway.refunded).toEqual(["pay_real"]);
    const rows = await db.select().from(refunds).where(eq(refunds.orderId, order.id));
    expect(rows.find((r) => r.id === fresh.id)?.status).toBe("PROCESSED");
    expect(rows.find((r) => r.id === sent.id)?.razorpayRefundId).toBe("rfnd_existing");
  });
});
