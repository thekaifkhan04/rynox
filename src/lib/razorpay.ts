import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import { env, razorpayConfigured } from "./env";

let client: Razorpay | null = null;

export function razorpay(): Razorpay {
  if (!razorpayConfigured) throw new Error("Razorpay keys are not configured");
  client ??= new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
  return client;
}

export function hmacHex(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqualHex(a: string, b: string) {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length > 0 && ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Signature Checkout returns to the browser: HMAC(order_id|payment_id, key_secret). */
export function verifyCheckoutSignature(
  input: { orderId: string; paymentId: string; signature: string },
  secret = env.razorpayKeySecret,
) {
  if (!secret) return false;
  return safeEqualHex(hmacHex(`${input.orderId}|${input.paymentId}`, secret), input.signature);
}

/** Webhook signature: HMAC(raw body, webhook secret). */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret = env.razorpayWebhookSecret,
) {
  if (!secret || !signature) return false;
  return safeEqualHex(hmacHex(rawBody, secret), signature);
}
