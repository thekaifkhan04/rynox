import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CheckInScanner } from "@/components/admin/check-in-scanner";
import { db } from "@/db";
import { events } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { emptyStats, statsByEvent } from "@/server/admin-queries";

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export const metadata = { title: "Check-in" };

export default async function CheckInPage({ params }: PageProps<"/admin/events/[id]/check-in">) {
  const { id } = await params;
  await requireAdmin();
  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) notFound();
  const stats = (await statsByEvent([event.id])).get(event.id) ?? emptyStats;
  return (
    <CheckInScanner
      eventId={event.id}
      timezone={event.timezone}
      initial={{ sold: stats.sold, checkedIn: stats.checkedIn }}
    />
  );
}
