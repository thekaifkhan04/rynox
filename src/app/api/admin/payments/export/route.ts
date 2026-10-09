import { formatInTimeZone } from "date-fns-tz";
import { getUser } from "@/lib/session";
import { listPayments } from "@/server/payment-queries";

/** Quote a CSV cell, and neutralise values a spreadsheet would run as a formula. */
function cell(value: unknown) {
  const text = value == null ? "" : String(value);
  const s = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const user = await getUser();
  if (!user?.isAdmin) return new Response("Not authorised", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const pick = (key: string) => (sp.get(key) === "any" ? "" : (sp.get(key) ?? ""));
  const { rows } = await listPayments(
    { q: pick("q"), event: pick("event"), status: pick("status") || "received", method: pick("method") },
    null,
  );
  const header = [
    "Order", "Event", "Buyer", "Email", "Phone", "Tickets", "Status", "Paid how", "Amount (INR)",
    "Refunded (INR)", "Net (INR)", "Paid at", "Created at", "Razorpay payment ID", "Razorpay order ID",
  ];
  const lines = rows.map(({ order: o, eventTitle, timezone, refundedPaise, tickets }) => {
    const when = (d: Date | null) => (d ? formatInTimeZone(d, timezone, "yyyy-MM-dd HH:mm") : "");
    return [
      o.orderNumber, eventTitle, o.buyerName, o.buyerEmail, o.buyerPhone, tickets, o.status, o.paymentMethod,
      (o.amountPaise / 100).toFixed(2), (refundedPaise / 100).toFixed(2), ((o.amountPaise - refundedPaise) / 100).toFixed(2),
      when(o.paidAt), when(o.createdAt),
      o.razorpayPaymentId?.startsWith("pay_") ? o.razorpayPaymentId : "", o.razorpayOrderId,
    ].map(cell).join(",");
  });
  return new Response(`﻿${[header.map(cell).join(","), ...lines].join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="payments.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
