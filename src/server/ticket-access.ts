import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import type { SessionUser } from "@/lib/session";

/**
 * A ticket with its event and type, if the user bought it, is the attendee
 * it was issued to (matched on their sign-in email), or is an admin.
 */
export async function getTicketFor(user: SessionUser, code: string) {
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.ticketCode, code.toUpperCase()),
    with: {
      event: true,
      order: true,
      levelResults: true,
      ticketType: { with: { competition: { with: { levels: true } } } },
    },
  });
  if (!ticket) return null;
  const isAttendee = ticket.attendeeEmail.toLowerCase() === user.email.toLowerCase();
  if (ticket.order.userId !== user.id && !isAttendee && !user.isAdmin) return null;
  return ticket;
}
