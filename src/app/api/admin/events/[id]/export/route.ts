import { getUser } from "@/lib/session";
import { getEventById } from "@/server/events";
import { registrationTable } from "@/server/export";

/** Quote a CSV cell, and neutralise values a spreadsheet would run as a formula. */
function cell(value: string) {
  const s = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request, { params }: RouteContext<"/api/admin/events/[id]/export">) {
  const user = await getUser();
  if (!user?.isAdmin) return new Response("Not authorised", { status: 403 });
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) return new Response("Event not found", { status: 404 });

  const sp = new URL(req.url).searchParams;
  const pick = (key: string) => (sp.get(key) === "all" ? "" : (sp.get(key) ?? ""));
  const { header, rows } = await registrationTable(event, {
    q: pick("q"),
    type: pick("type"),
    status: pick("status"),
    checkin: pick("checkin"),
  });
  // BOM so Excel opens the file as UTF-8.
  const csv = `﻿${[header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}-registrations.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
