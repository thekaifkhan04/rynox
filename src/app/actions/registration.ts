"use server";

import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { env, mockPayments, razorpayConfigured } from "@/lib/env";
import { getUser } from "@/lib/session";
import { sendOrderEmail } from "@/server/emails";
import { createOrder, OrderError, type CreateOrderInput } from "@/server/orders";
import { applyToSponsor, type SponsorApplicationInput } from "@/server/sponsors";
import { confirmCheckout, ensureRazorpayOrder, simulatePayment } from "@/server/payments";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

export async function registerAction(input: CreateOrderInput): Promise<Result<{ orderId: string }>> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Please sign in to register." };
  try {
    const order = await createOrder(user, input);
    if (order.status === "PAID") {
      after(() => sendOrderEmail(order.id).catch((e) => console.error("Ticket email failed", e)));
    }
    return { ok: true, orderId: order.id };
  } catch (err) {
    if (err instanceof OrderError) return { ok: false, error: err.message };
    console.error("registerAction failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function sponsorApplyAction(input: SponsorApplicationInput): Promise<Result<object>> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Please sign in to send a sponsorship request." };
  try {
    await applyToSponsor(user, input);
    return { ok: true };
  } catch (err) {
    if (err instanceof OrderError) return { ok: false, error: err.message };
    console.error("sponsorApplyAction failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export type CheckoutConfig =
  | { mode: "razorpay"; keyId: string; razorpayOrderId: string; amountPaise: number; currency: string }
  | { mode: "mock" };

export async function startPaymentAction(orderId: string): Promise<Result<{ checkout: CheckoutConfig }>> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Please sign in." };
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, user.id)));
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "PENDING" || order.expiresAt < new Date()) {
    return { ok: false, error: "This order can no longer be paid. Please register again." };
  }
  if (!razorpayConfigured) {
    return mockPayments
      ? { ok: true, checkout: { mode: "mock" } }
      : { ok: false, error: "Online payments are not available right now." };
  }
  try {
    const razorpayOrderId = await ensureRazorpayOrder(order.id);
    if (!razorpayOrderId) return { ok: false, error: "Could not start the payment." };
    return {
      ok: true,
      checkout: {
        mode: "razorpay",
        keyId: env.razorpayKeyId,
        razorpayOrderId,
        amountPaise: order.amountPaise,
        currency: order.currency,
      },
    };
  } catch (err) {
    console.error("startPaymentAction failed", err);
    return { ok: false, error: "Could not reach the payment gateway. Please try again." };
  }
}

export async function confirmPaymentAction(input: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<Result<{ outcome: string }>> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Please sign in." };
  try {
    const res = await confirmCheckout({
      userId: user.id,
      razorpayOrderId: String(input.razorpay_order_id),
      razorpayPaymentId: String(input.razorpay_payment_id),
      razorpaySignature: String(input.razorpay_signature),
    });
    if (res.outcome === "fulfilled" || res.outcome === "already_paid") {
      return { ok: true, outcome: res.outcome };
    }
    if (res.outcome === "refund_required") {
      return {
        ok: false,
        error: "The seats were taken before your payment arrived. Your payment is being refunded.",
      };
    }
    return { ok: false, error: "We could not verify this payment. If money was deducted, it will be confirmed or refunded automatically." };
  } catch (err) {
    console.error("confirmPaymentAction failed", err);
    // The webhook will still confirm the order if the payment was captured.
    return { ok: false, error: "Verification is taking longer than usual. Refresh this page in a moment." };
  }
}

export async function simulatePaymentAction(orderId: string): Promise<Result<{ outcome: string }>> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Please sign in." };
  if (!mockPayments) return { ok: false, error: "Simulated payments are disabled." };
  const res = await simulatePayment(orderId, user.id);
  return res.outcome === "fulfilled" || res.outcome === "already_paid"
    ? { ok: true, outcome: res.outcome }
    : { ok: false, error: `Payment not applied (${res.outcome}).` };
}
