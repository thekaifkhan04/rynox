import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `after` needs a request scope; in tests, run the callback straight away.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

import { db } from "@/db";
import { emailLogs, orders, refunds, tickets, webhookEvents } from "@/db/schema";
import { hmacHex, verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/razorpay";
import { createOrder } from "@/server/orders";
import { handleWebhook, processRefunds } from "@/server/payments";
import { attendee, makeEvent, makeUser, resetDb } from "./helpers";

const KEY_SECRET = "test_key_secret";
const WEBHOOK_SECRET = "test_webhook_secret";

beforeEach(resetDb);

describe("signatures", () => {
  it("accepts a genuine checkout signature and rejects tampering", () => {
    const signature = hmacHex("order_1|pay_1", KEY_SECRET);
    expect(verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature })).toBe(true);
    expect(verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_2", signature })).toBe(false);
    expect(verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature: "" })).toBe(false);
    expect(verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature: "zz" })).toBe(false);
  });

  it("verifies webhook signatures over the raw body", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyWebhookSignature(body, hmacHex(body, WEBHOOK_SECRET))).toBe(true);
    expect(verifyWebhookSignature(`${body} `, hmacHex(body, WEBHOOK_SECRET))).toBe(false);
    expect(verifyWebhookSignature(body, hmacHex(body, "wrong"))).toBe(false);
  });
});

describe("webhook", () => {
  async function pendingOrder() {
    const { event, types } = await makeEvent();
    const order = await createOrder(await makeUser(), {
      eventId: event.id,
      attendees: [attendee(types[0].id)],
    });
    await db.update(orders).set({ razorpayOrderId: `order_${order.id}` }).where(eq(orders.id, order.id));
    return { ...order, razorpayOrderId: `order_${order.id}` };
  }

  const captured = (order: { razorpayOrderId: string; amountPaise: number }, amount = order.amountPaise) =>
    JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: { entity: { id: "pay_abc", order_id: order.razorpayOrderId, amount, status: "captured" } },
      },
    });
  const send = (body: string, id: string | null, signature = hmacHex(body, WEBHOOK_SECRET)) =>
    handleWebhook(body, signature, id);
  const statusOf = async (id: string) =>
    (await db.select().from(orders).where(eq(orders.id, id)))[0].status;

  it("rejects a bad signature without touching the order", async () => {
    const order = await pendingOrder();
    const res = await send(captured(order), "evt_1", "deadbeef");
    expect(res.status).toBe(400);
    expect(await statusOf(order.id)).toBe("PENDING");
  });

  it("confirms the order, issues tickets and emails them", async () => {
    const order = await pendingOrder();
    expect((await send(captured(order), "evt_1")).status).toBe(200);
    expect(await statusOf(order.id)).toBe("PAID");
    const [t] = await db.select().from(tickets).where(eq(tickets.orderId, order.id));
    expect(t.status).toBe("VALID");
    await vi.waitFor(async () => {
      const logs = await db.select().from(emailLogs).where(eq(emailLogs.orderId, order.id));
      expect(logs.map((l) => `${l.kind}:${l.status}`)).toEqual(["TICKETS:SENT"]);
    });
  });

  it("ignores a repeated delivery", async () => {
    const order = await pendingOrder();
    await send(captured(order), "evt_1");
    expect((await send(captured(order), "evt_1")).message).toBe("Duplicate");
    expect(await db.select().from(webhookEvents)).toHaveLength(1);
    await vi.waitFor(async () =>
      expect(await db.select().from(emailLogs).where(eq(emailLogs.orderId, order.id))).toHaveLength(1),
    );
  });

  it("does not confirm when the paid amount differs from the order", async () => {
    const order = await pendingOrder();
    await send(captured(order, 100), "evt_1");
    expect(await statusOf(order.id)).toBe("PENDING");
  });

  it("marks refunds processed or failed from refund events", async () => {
    const order = await pendingOrder();
    const [r] = await db
      .insert(refunds)
      .values({ orderId: order.id, amountPaise: 100, razorpayRefundId: "rfnd_1" })
      .returning();
    const body = JSON.stringify({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_1", status: "processed" } } } });
    await send(body, "evt_r");
    expect((await db.select().from(refunds).where(eq(refunds.id, r.id)))[0].status).toBe("PROCESSED");
  });
});

describe("processRefunds", () => {
  it("marks a refund failed when the order has no payment to refund", async () => {
    const { event, types } = await makeEvent();
    const order = await createOrder(await makeUser(), { eventId: event.id, attendees: [attendee(types[0].id)] });
    const [r] = await db.insert(refunds).values({ orderId: order.id, amountPaise: 100 }).returning();
    await processRefunds([r.id]);
    expect((await db.select().from(refunds).where(eq(refunds.id, r.id)))[0].status).toBe("FAILED");
  });

  it("settles refunds of simulated payments without calling Razorpay", async () => {
    const { event, types } = await makeEvent();
    const order = await createOrder(await makeUser(), { eventId: event.id, attendees: [attendee(types[0].id)] });
    await db.update(orders).set({ razorpayPaymentId: "mock_1" }).where(eq(orders.id, order.id));
    const [r] = await db.insert(refunds).values({ orderId: order.id, amountPaise: 100 }).returning();
    await processRefunds([r.id]);
    expect((await db.select().from(refunds).where(eq(refunds.id, r.id)))[0].status).toBe("PROCESSED");
  });
});
