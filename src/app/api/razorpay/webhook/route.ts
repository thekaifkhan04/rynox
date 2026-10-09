import { handleWebhook } from "@/server/payments";

export async function POST(req: Request) {
  // The signature is computed over the exact bytes, so read the body as text.
  const raw = await req.text();
  try {
    const res = await handleWebhook(
      raw,
      req.headers.get("x-razorpay-signature") ?? "",
      req.headers.get("x-razorpay-event-id"),
    );
    return new Response(res.message, { status: res.status });
  } catch (err) {
    console.error("Razorpay webhook failed", err);
    return new Response("Error", { status: 500 }); // Razorpay will retry
  }
}
