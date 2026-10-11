import "server-only";
import { cancelTickets } from "./orders";
import { sendRefundEmail } from "./emails";
import { processRefunds } from "./payments";

/** Admin action: cancel tickets, refund them through Razorpay, tell the buyer. */
export async function cancelAndRefund(orderId: string, ticketIds: string[], reason?: string) {
  const result = await cancelTickets(orderId, ticketIds, reason);
  await processRefunds(result.refundIds);
  await sendRefundEmail(orderId, result.amountPaise, "cancelled").catch((e) =>
    console.error("Cancellation email failed", e),
  );
  return result;
}
