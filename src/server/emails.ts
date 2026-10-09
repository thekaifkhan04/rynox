import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailLogs, orders } from "@/db/schema";
import { formatDateRange, formatTime } from "@/lib/dates";
import { env } from "@/lib/env";
import { sendMail, type MailAttachment } from "@/lib/mail";
import { formatAmount, formatPaise } from "@/lib/money";
import { qrPng, ticketsPdf } from "./ticket-assets";

const esc = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(accent: string, heading: string, inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#0b0b0d;font-family:Helvetica,Arial,sans-serif;color:#f5f5f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0d;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#141417;border:1px solid #2a2a2e;border-radius:12px;overflow:hidden">
<tr><td style="background:${accent};padding:22px 26px;color:#0b0b0d">
<div style="font-size:11px;letter-spacing:2px;font-weight:700">${esc(env.siteName.toUpperCase())}</div>
<div style="font-size:24px;font-weight:800;margin-top:6px">${heading}</div></td></tr>
<tr><td style="padding:26px">${inner}</td></tr></table>
<div style="color:#77777f;font-size:12px;margin-top:16px">${esc(env.siteName)}</div>
</td></tr></table></body></html>`;
}

async function loadOrder(orderId: string) {
  return db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { event: true, tickets: { with: { ticketType: true } } },
  });
}

async function log(orderId: string, kind: string, toEmail: string, run: () => Promise<void>) {
  try {
    await run();
    await db.insert(emailLogs).values({ orderId, kind, toEmail, status: "SENT" });
  } catch (err) {
    await db.insert(emailLogs).values({
      orderId,
      kind,
      toEmail,
      status: "FAILED",
      error: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
    throw err;
  }
}

/** Confirmation email to the buyer with every valid ticket (inline QR + PDF). */
export async function sendOrderEmail(orderId: string) {
  const order = await loadOrder(orderId);
  if (!order) throw new Error("Order not found");
  const valid = order.tickets.filter((t) => t.status === "VALID");
  if (valid.length === 0) throw new Error("This order has no valid tickets to send");
  const { event } = order;
  const when = `${formatDateRange(event.startsAt, event.endsAt, event.timezone)} · ${formatTime(event.startsAt, event.timezone)}`;
  const where = [event.venueName, event.city].filter(Boolean).join(", ");

  const attachments: MailAttachment[] = [];
  const blocks: string[] = [];
  for (const t of valid) {
    const cid = `qr-${t.ticketCode}`;
    attachments.push({
      filename: `${t.ticketCode}.png`,
      content: await qrPng(t.qrToken),
      contentType: "image/png",
      cid,
    });
    blocks.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2a2a2e;border-radius:10px;margin-top:16px"><tr>
<td style="padding:16px;vertical-align:top">
<div style="font-size:11px;letter-spacing:1.5px;color:#8b8b93">ATHLETE</div>
<div style="font-size:18px;font-weight:700;margin-top:2px">${esc(t.attendeeName)}</div>
<div style="font-size:11px;letter-spacing:1.5px;color:#8b8b93;margin-top:12px">CATEGORY</div>
<div style="font-size:14px;margin-top:2px">${esc(t.ticketType.name)} · ${formatPaise(t.pricePaise)}</div>
<div style="font-size:11px;letter-spacing:1.5px;color:#8b8b93;margin-top:12px">TICKET ID</div>
<div style="font-family:Courier,monospace;font-size:15px;font-weight:700;margin-top:2px">${t.ticketCode}</div>
<div style="margin-top:14px"><a href="${env.appUrl}/tickets/${t.ticketCode}" style="color:${event.accentColor};font-size:13px">View ticket online</a></div>
</td>
<td width="150" style="padding:16px" align="right"><img src="cid:${cid}" width="140" height="140" alt="QR code for ${t.ticketCode}" style="border-radius:6px;background:#fff"></td>
</tr></table>`);
  }
  attachments.push({
    filename: `tickets-${order.orderNumber}.pdf`,
    content: await ticketsPdf(valid.map((t) => ({ ticket: t, ticketType: t.ticketType, event }))),
    contentType: "application/pdf",
  });

  const html = layout(
    event.accentColor,
    "You're in.",
    `<p style="margin:0;font-size:15px;line-height:1.6">Hi ${esc(order.buyerName)}, your registration for <strong>${esc(event.title)}</strong> is confirmed.</p>
<p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#c9c9cf">${esc(when)}<br>${esc(where)}</p>
${blocks.join("")}
<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#8b8b93">Order ${order.orderNumber} · Paid ${formatAmount(order.amountPaise)}. Show the QR code at the entrance; each code can be scanned once. Your tickets are also attached as a PDF.</p>`,
  );
  const text = [
    `Your registration for ${event.title} is confirmed.`,
    `${when} — ${where}`,
    ...valid.map((t) => `${t.attendeeName} · ${t.ticketType.name} · ${t.ticketCode} · ${env.appUrl}/tickets/${t.ticketCode}`),
    `Order ${order.orderNumber}, paid ${formatAmount(order.amountPaise)}.`,
  ].join("\n");

  await log(order.id, "TICKETS", order.buyerEmail, () =>
    sendMail({
      to: order.buyerEmail,
      subject: `Your ticket${valid.length > 1 ? "s" : ""} for ${event.title}`,
      html,
      text,
      attachments,
    }),
  );
}

export async function sendRefundEmail(
  orderId: string,
  amountPaise: number,
  why: "sold_out" | "cancelled",
) {
  const order = await loadOrder(orderId);
  if (!order) throw new Error("Order not found");
  const reason =
    why === "sold_out"
      ? "Your payment arrived after the seat hold expired and the event had sold out, so we could not confirm your registration."
      : "Your registration has been cancelled by the organiser.";
  const money =
    amountPaise > 0 && order.paymentMethod === "OFFLINE"
      ? `Your payment of ${formatAmount(amountPaise)} was made in person, so the organiser will return it to you directly.`
      : amountPaise > 0
      ? `A refund of ${formatAmount(amountPaise)} has been initiated to your original payment method. It usually arrives within 5–7 working days.`
      : "";
  const html = layout(
    order.event.accentColor,
    why === "sold_out" ? "Payment refunded" : "Registration cancelled",
    `<p style="margin:0;font-size:15px;line-height:1.6">Hi ${esc(order.buyerName)},</p>
<p style="margin:12px 0 0;font-size:15px;line-height:1.6">${reason}</p>
<p style="margin:12px 0 0;font-size:15px;line-height:1.6">${money}</p>
<p style="margin:20px 0 0;font-size:13px;color:#8b8b93">${esc(order.event.title)} · Order ${order.orderNumber}</p>`,
  );
  await log(order.id, "REFUND", order.buyerEmail, () =>
    sendMail({
      to: order.buyerEmail,
      subject: `${why === "sold_out" ? "Refund" : "Cancellation"}: ${order.event.title}`,
      html,
      text: `${reason} ${money}\n${order.event.title} · Order ${order.orderNumber}`,
    }),
  );
}
