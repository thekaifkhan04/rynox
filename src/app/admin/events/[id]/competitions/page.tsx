import { notFound } from "next/navigation";
import { CompetitionsEditor } from "@/components/admin/competitions-editor";
import { requireAdmin } from "@/lib/session";
import { getEventById } from "@/server/events";

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export const metadata = { title: "Competitions" };

export default async function CompetitionsPage({
  params,
}: PageProps<"/admin/events/[id]/competitions">) {
  const { id } = await params;
  await requireAdmin();
  const event = await getEventById(id);
  if (!event) notFound();
  return (
    <CompetitionsEditor
      eventId={event.id}
      rows={event.competitions.map((c) => ({
        ...c,
        ticketTypeNames: event.ticketTypes.filter((t) => t.competitionId === c.id).map((t) => t.name),
      }))}
    />
  );
}
