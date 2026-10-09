import { notFound } from "next/navigation";
import { SectionsEditor } from "@/components/admin/sections-editor";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/session";
import { getEventById } from "@/server/events";

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export const metadata = { title: "Landing page" };

export default async function LandingEditorPage({ params }: PageProps<"/admin/events/[id]/landing">) {
  const { id } = await params;
  await requireAdmin();
  const event = await getEventById(id);
  if (!event) notFound();
  return (
    <SectionsEditor
      eventId={event.id}
      slug={event.slug}
      sections={event.sections}
      uploads={Boolean(env.blobToken)}
    />
  );
}
