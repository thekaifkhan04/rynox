import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Razorpay itself is replaced by a stand-in that records what it was asked to do.
const gateway = vi.hoisted(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
  return {
    created: 0,
    refunded: [] as string[],
    captured: [] as string[],
    /** What Razorpay "knows" about a payment when asked. */
    payment: null as null | { order_id: string; amount: number; status: string },
    fetchDelayMs: 0,
  };
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
      fetch: async (id: string) => {
        await new Promise((r) => setTimeout(r, gateway.fetchDelayMs));
        return { id, ...gateway.payment };
      },
      capture: async (id: string) => {
        gateway.captured.push(id);
      },
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
import { tickets } from "@/db/schema";
import { hmacHex } from "@/lib/razorpay";
import { confirmCheckout, ensureRazorpayOrder, processRefunds } from "@/server/payments";
import { attendee, makeEvent, makeUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  gateway.created = 0;
  gateway.refunded = [];
  gateway.captured = [];
  gateway.payment = null;
  gateway.fetchDelayMs = 0;
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

describe("confirmCheckout", () => {
  async function readyToPay() {
    const { event, types } = await makeEvent();
    const buyer = await makeUser();
    const order = await createOrder(buyer, { eventId: event.id, attendees: [attendee(types[0].id)] });
    const razorpayOrderId = (await ensureRazorpayOrder(order.id))!;
    const sign = (paymentId: string) => hmacHex(`${razorpayOrderId}|${paymentId}`, "test_key_secret");
    return { order, buyer, razorpayOrderId, sign };
  }

  it("issues the ticket on a valid signature without waiting for Razorpay's API", async () => {
    const { order, buyer, razorpayOrderId, sign } = await readyToPay();
    // Razorpay's API is slow (as on a bad network) and the payment is only authorised so far.
    gateway.fetchDelayMs = 400;
    gateway.payment = { order_id: razorpayOrderId, amount: order.amountPaise, status: "authorized" };

    const started = Date.now();
    const res = await confirmCheckout({
      userId: buyer.id,
      razorpayOrderId,
      razorpayPaymentId: "pay_ok",
      razorpaySignature: sign("pay_ok"),
    });
    expect(res.outcome).toBe("fulfilled");
    expect(Date.now() - started).toBeLessThan(350);
    const [t] = await db.select().from(tickets).where(eq(tickets.orderId, order.id));
    expect(t.status).toBe("VALID");

    // The cross-check still runs afterwards and captures the authorised payment.
    await vi.waitFor(() => expect(gateway.captured).toEqual(["pay_ok"]), { timeout: 3000 });
  });

  it("refuses a forged signature and another account's order", async () => {
    const { order, buyer, razorpayOrderId, sign } = await readyToPay();
    const forged = await confirmCheckout({
      userId: buyer.id,
      razorpayOrderId,
      razorpayPaymentId: "pay_fake",
      razorpaySignature: sign("pay_other"),
    });
    expect(forged.outcome).toBe("invalid_signature");

    const stranger = await makeUser();
    const notMine = await confirmCheckout({
      userId: stranger.id,
      razorpayOrderId,
      razorpayPaymentId: "pay_ok",
      razorpaySignature: sign("pay_ok"),
    });
    expect(notMine.outcome).toBe("not_found");

    const [saved] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(saved.status).toBe("PENDING");
  });
});
