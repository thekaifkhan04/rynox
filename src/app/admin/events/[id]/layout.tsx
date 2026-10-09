import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { EventNav } from "@/components/admin/event-nav";
import { FeatureToggle } from "@/components/admin/feature-toggle";
import { EventStatusControls } from "@/components/admin/event-status-controls";
import { EventStatusBadge } from "@/components/admin/status-badge";
import { db } from "@/db";
import { events } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { requireAdmin } from "@/lib/session";

async function Header({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) notFound();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{event.title}</h1>
            <EventStatusBadge status={event.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDateTime(event.startsAt, event.timezone)} · {event.venueName} ·{" "}
            <Link href={`/events/${event.slug}`} className="underline underline-offset-4 hover:text-white" target="_blank">
              /events/{event.slug}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FeatureToggle eventId={event.id} title={event.title} featured={event.featuredOnHome} />
          <EventStatusControls id={event.id} status={event.status} />
        </div>
      </div>
      <EventNav eventId={event.id} />
    </div>
  );
}

export default function EventAdminLayout({ children, params }: LayoutProps<"/admin/events/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="h-24 animate-pulse rounded-lg bg-white/5" />}>
        <Header params={params} />
      </Suspense>
      {children}
    </div>
  );
}
