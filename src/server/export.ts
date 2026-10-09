import "server-only";
import { inArray } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { levelResults } from "@/db/schema";
import { listRegistrations, type RegistrationFilters } from "./admin-queries";
import type { EventWithDetails } from "./events";
import { progressLabel, progressOf } from "./progress";

/**
 * An event's registrations as a plain table: one header row and one row of
 * text per ticket. The CSV download and the Google Sheets sync both use it.
 */
export async function registrationTable(event: EventWithDetails, filters: RegistrationFilters = {}) {
  const { rows } = await listRegistrations(event.id, filters, null);
  const results = rows.length
    ? await db
        .select()
        .from(levelResults)
        .where(inArray(levelResults.ticketId, rows.map((r) => r.ticket.id)))
    : [];
  const competitionOf = (ticketTypeId: string) => {
    const type = event.ticketTypes.find((t) => t.id === ticketTypeId);
    return event.competitions.find((c) => c.id === type?.competitionId) ?? null;
  };
  const resultsByTicket = Map.groupBy(results, (r) => r.ticketId);
  const progressText = (ticketId: string, ticketTypeId: string) => {
    const mine = resultsByTicket.get(ticketId) ?? [];
    const progress = progressOf(competitionOf(ticketTypeId)?.levels ?? [], mine);
    const last = progress.state === "none" ? null : mine.find((r) => r.levelId === progress.level.id);
    return { label: progressLabel(progress) ?? "", result: last?.result ?? "" };
  };
  const when = (d: Date | null) => (d ? formatInTimeZone(d, event.timezone, "yyyy-MM-dd HH:mm") : "");

  const header = [
    "Ticket ID", "Name", "Email", "Phone", "College / Company", "Competition", "Ticket type",
    "Level", "Level result", "Price (INR)", "Ticket status", "Order", "Order status",
    "Payment method", "Buyer email", "Payment ID", "Paid at", "Checked in at", "Registered at",
    ...event.formFields.map((f) => f.label),
  ];
  const body = rows.map((r) => {
    const progress = progressText(r.ticket.id, r.ticket.ticketTypeId);
    return [
      r.ticket.ticketCode, r.ticket.attendeeName, r.ticket.attendeeEmail, r.ticket.attendeePhone,
      r.ticket.organization, competitionOf(r.ticket.ticketTypeId)?.name, r.typeName,
      progress.label, progress.result, (r.ticket.pricePaise / 100).toFixed(2),
      r.ticket.status, r.orderNumber, r.orderStatus, r.paymentMethod, r.buyerEmail,
      // Offline orders carry an internal marker, not a gateway payment id.
      r.paymentMethod === "OFFLINE" ? "" : r.paymentId,
      when(r.paidAt), when(r.ticket.checkedInAt), when(r.ticket.createdAt),
      ...event.formFields.map((f) => {
        const v = r.ticket.answers[f.key];
        return v === true ? "Yes" : v === false ? "No" : v;
      }),
    ].map((v) => (v == null ? "" : String(v)));
  });
  return { header, rows: body };
}
