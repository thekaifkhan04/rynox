import { writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import type { Event, Ticket, TicketType } from "@/db/schema";
import { ticketsPdf } from "@/server/ticket-assets";

const event = {
  title: "RYNOX",
  accentColor: "#dc1e2d",
  venueName: "Venue to be announced",
  city: "Ranchi",
  startsAt: new Date("2026-12-20T00:30:00Z"),
  endsAt: new Date("2026-12-20T10:30:00Z"),
  timezone: "Asia/Kolkata",
} as Event;
const ticketType = { name: "Men" } as TicketType;
const ticket = (n: number, status: Ticket["status"] = "VALID") =>
  ({
    id: `t${n}`,
    ticketCode: `TKT-TEST000${n}`,
    qrToken: `token-${n}-abcdefghijklmnopqrstuvwxyz`,
    attendeeName: n === 1 ? "Ananya Rao" : "A Very Long Attendee Name That Should Still Fit Nicely",
    status,
    checkedInAt: null,
  }) as Ticket;

it("renders one PDF page per ticket", async () => {
  const pdf = await ticketsPdf([
    { ticket: ticket(1), ticketType, event },
    { ticket: ticket(2), ticketType, event },
  ]);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  // Each page object is declared once; "/Type /Pages" is the tree root and is excluded.
  const pages = pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? [];
  expect(pages).toHaveLength(2);
  // Set PDF_OUT=/some/file.pdf to keep the file and look at it.
  if (process.env.PDF_OUT) await writeFile(process.env.PDF_OUT, pdf);
});
