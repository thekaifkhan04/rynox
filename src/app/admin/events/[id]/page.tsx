import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { EventForm } from "@/components/admin/event-form";
import { db } from "@/db";
import { events } from "@/db/schema";
import { toLocalInput } from "@/lib/dates";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/session";

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export const metadata = { title: "Event details" };

export default async function EventDetailsPage({ params }: PageProps<"/admin/events/[id]">) {
  const { id } = await params;
  await requireAdmin();
  const [e] = await db.select().from(events).where(eq(events.id, id));
  if (!e) notFound();
  return (
    <EventForm
      id={e.id}
      uploads={Boolean(env.blobToken)}
      initial={{
        title: e.title,
        slug: e.slug,
        tagline: e.tagline ?? "",
        summary: e.summary ?? "",
        coverImageUrl: e.coverImageUrl ?? "",
        accentColor: e.accentColor,
        venueName: e.venueName,
        venueAddress: e.venueAddress ?? "",
        city: e.city ?? "",
        mapUrl: e.mapUrl ?? "",
        timezone: e.timezone,
        startsAt: toLocalInput(e.startsAt, e.timezone),
        endsAt: toLocalInput(e.endsAt, e.timezone),
        registrationOpensAt: toLocalInput(e.registrationOpensAt, e.timezone),
        registrationClosesAt: toLocalInput(e.registrationClosesAt, e.timezone),
        capacity: e.capacity == null ? "" : String(e.capacity),
        maxTicketsPerOrder: e.maxTicketsPerOrder,
      }}
    />
  );
}
