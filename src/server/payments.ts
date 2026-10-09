import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { orders, refunds, webhookEvents } from "@/db/schema";
import { env, mockPayments, razorpayConfigured } from "@/lib/env";
import { razorpay, verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/razorpay";
import { sendOrderEmail, sendRefundEmail } from "./emails";
import { fulfillOrder, markOrderFailed, type FulfillResult } from "./orders";

/** Create (once) the Razorpay order that backs a pending order. */
export async function ensureRazorpayOrder(orderId: string): Promise<string | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.status !== "PENDING" || order.amountPaise === 0) return null;
  if (order.razorpayOrderId) return order.razorpayOrderId;
  if (!razorpayConfigured) return null;

  const rzpOrder = await razorpay().orders.create({
    amount: order.amountPaise,
    currency: order.currency,
    receipt: order.orderNumber,
    notes: { orderId: order.id, eventId: order.eventId },
  });
  await db.update(orders).set({ razorpayOrderId: rzpOrder.id }).where(eq(orders.id, order.id));
  return rzpOrder.id;
}

/** Send the refunds recorded for an order to Razorpay and store the outcome. */
export async function processRefunds(refundIds: string[]) {
  if (refundIds.length === 0) return;
  const rows = await db.query.refunds.findMany({
    where: and(inArray(refunds.id, refundIds), inArray(refunds.status, ["PENDING", "FAILED"])),
    with: { order: true },
  });
  for (const r of rows) {
    const paymentId = r.order.razorpayPaymentId;
    try {
      if (!paymentId) throw new Error("Order has no payment to refund");
      // Simulated and offline (cash) payments have nothing to send to Razorpay.
      // For offline orders the organiser hands the money back in person.
      if (paymentId.startsWith("mock_") || paymentId.startsWith("offline_")) {
        await db.update(refunds).set({ status: "PROCESSED" }).where(eq(refunds.id, r.id));
        continue;
      }
      const res = await razorpay().payments.refund(paymentId, {
        amount: r.amountPaise,
        speed: "normal",
        notes: { refundId: r.id, orderId: r.orderId },
      });
      await db
        .update(refunds)
        .set({
          razorpayRefundId: res.id,
          status: res.status === "processed" ? "PROCESSED" : "PENDING",
        })
        .where(eq(refunds.id, r.id));
    } catch (err) {
      console.error("Refund failed", r.id, err);
      await db.update(refunds).set({ status: "FAILED" }).where(eq(refunds.id, r.id));
    }
  }
}

/** Runs after any successful payment signal: confirm, then email or auto-refund. */
async function settle(orderId: string, paymentId: string): Promise<FulfillResult> {
  const result = await fulfillOrder(orderId, paymentId);
  if (result.outcome === "fulfilled") {
    // Sent after the response so the buyer sees their ticket immediately.
    after(() => sendOrderEmail(orderId).catch((e) => console.error("Ticket email failed", e)));
  } else if (result.outcome === "refund_required") {
    const [refund] = await db
      .insert(refunds)
      .values({
        orderId,
        amountPaise: result.amountPaise,
        reason: "Payment arrived after the seats were released",
      })
      .returning({ id: refunds.id });
    await processRefunds([refund.id]);
    await sendRefundEmail(orderId, result.amountPaise, "sold_out").catch((e) =>
      console.error("Refund email failed", e),
    );
  }
  return result;
}

/** Called from the browser after Razorpay Checkout succeeds. */
export async function confirmCheckout(input: {
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<FulfillResult | { outcome: "invalid_signature" | "payment_mismatch" }> {
  const ok = verifyCheckoutSignature({
    orderId: input.razorpayOrderId,
    paymentId: input.razorpayPaymentId,
    signature: input.razorpaySignature,
  });
  if (!ok) return { outcome: "invalid_signature" };

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.razorpayOrderId, input.razorpayOrderId), eq(orders.userId, input.userId)));
  if (!order) return { outcome: "not_found" };

  // Belt and braces: confirm amount and capture state with Razorpay itself.
  const payment = await razorpay().payments.fetch(input.razorpayPaymentId);
  if (payment.order_id !== order.razorpayOrderId || Number(payment.amount) !== order.amountPaise) {
    return { outcome: "payment_mismatch" };
  }
  if (payment.status === "authorized") {
    await razorpay().payments.capture(payment.id, order.amountPaise, order.currency);
  } else if (payment.status !== "captured") {
    return { outcome: "payment_mismatch" };
  }
  return settle(order.id, payment.id);
}

/** Development only: pay an order without Razorpay when no keys are configured. */
export async function simulatePayment(orderId: string, userId: string) {
  if (!mockPayments) throw new Error("Simulated payments are disabled");
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
  if (!order) return { outcome: "not_found" as const };
  return settle(order.id, `mock_${order.orderNumber}`);
}

type WebhookBody = {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id?: string; amount: number; status: string } };
    order?: { entity: { id: string } };
    refund?: { entity: { id: string; status: string; notes?: { refundId?: string } } };
  };
};

/**
 * Razorpay webhook. The signature covers the raw body, so it must be
 * verified before parsing. Deliveries are de-duplicated by event id.
 */
export async function handleWebhook(
  rawBody: string,
  signature: string,
  eventId: string | null,
): Promise<{ status: number; message: string }> {
  if (!env.razorpayWebhookSecret) return { status: 503, message: "Webhook secret not configured" };
  if (!verifyWebhookSignature(rawBody, signature)) return { status: 400, message: "Bad signature" };

  const body = JSON.parse(rawBody) as WebhookBody;
  if (eventId) {
    const inserted = await db
      .insert(webhookEvents)
      .values({ id: eventId, type: body.event })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    if (inserted.length === 0) return { status: 200, message: "Duplicate" };
  }

  try {
    switch (body.event) {
      case "payment.captured":
      case "order.paid": {
        const payment = body.payload.payment?.entity;
        if (!payment?.order_id) break;
        const [order] = await db
          .select()
          .from(orders)
          .where(eq(orders.razorpayOrderId, payment.order_id));
        if (!order || Number(payment.amount) !== order.amountPaise) break;
        await settle(order.id, payment.id);
        break;
      }
      case "payment.failed": {
        const orderId = body.payload.payment?.entity.order_id;
        if (!orderId) break;
        const [order] = await db.select().from(orders).where(eq(orders.razorpayOrderId, orderId));
        // Left pending: the buyer can retry on the same Razorpay order until the hold expires.
        if (order && order.expiresAt < new Date()) await markOrderFailed(order.id);
        break;
      }
      case "refund.processed":
      case "refund.failed": {
        const refund = body.payload.refund?.entity;
        if (!refund) break;
        await db
          .update(refunds)
          .set({ status: body.event === "refund.processed" ? "PROCESSED" : "FAILED" })
          .where(eq(refunds.razorpayRefundId, refund.id));
        break;
      }
    }
  } catch (err) {
    // Let Razorpay retry: forget this delivery so the retry is not treated as a duplicate.
    if (eventId) await db.delete(webhookEvents).where(eq(webhookEvents.id, eventId));
    throw err;
  }
  return { status: 200, message: "OK" };
}
