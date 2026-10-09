import { notFound } from "next/navigation";
import { TicketTypesEditor } from "@/components/admin/ticket-types-editor";
import { db } from "@/db";
import { requireAdmin } from "@/lib/session";
import { heldByType } from "@/server/availability";
import { getEventById } from "@/server/events";

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export const metadata = { title: "Ticket types" };

export default async function TicketTypesPage({ params }: PageProps<"/admin/events/[id]/tickets">) {
  const { id } = await params;
  await requireAdmin();
  const event = await getEventById(id);
  if (!event) notFound();
  const held = await heldByType(db, event.id);
  return (
    <TicketTypesEditor
      eventId={event.id}
      competitions={event.competitions.map((c) => ({ id: c.id, name: c.name }))}
      rows={event.ticketTypes.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description ?? "",
        competitionId: t.competitionId ?? "",
        price: t.pricePaise === 0 ? "0" : String(t.pricePaise / 100),
        offlinePrice: t.offlinePricePaise == null ? "" : String(t.offlinePricePaise / 100),
        quota: t.quota == null ? "" : String(t.quota),
        active: t.active,
        sold: held.get(t.id) ?? 0,
      }))}
    />
  );
}
