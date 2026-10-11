import { getUser } from "@/lib/session";
import { getTicketFor } from "@/server/ticket-access";
import { ticketsPdf } from "@/server/ticket-assets";

export async function GET(_req: Request, { params }: RouteContext<"/tickets/[code]/pdf">) {
  const user = await getUser();
  if (!user) return new Response("Sign in to download this ticket", { status: 401 });
  const { code } = await params;
  const ticket = await getTicketFor(user, code);
  if (!ticket || ticket.status !== "VALID") return new Response("Ticket not found", { status: 404 });

  const pdf = await ticketsPdf([{ ticket, ticketType: ticket.ticketType, event: ticket.event }]);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ticket.ticketCode}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
