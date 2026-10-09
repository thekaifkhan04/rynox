import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { SponsorsEditor } from "@/components/admin/sponsors-editor";
import { db } from "@/db";
import { events, sponsorTiers, sponsors } from "@/db/schema";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/session";

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export const metadata = { title: "Sponsors" };

export default async function SponsorsPage({ params }: PageProps<"/admin/events/[id]/sponsors">) {
  const { id } = await params;
  await requireAdmin();
  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) notFound();
  const tiers = await db
    .select()
    .from(sponsorTiers)
    .where(eq(sponsorTiers.eventId, event.id))
    .orderBy(asc(sponsorTiers.sortOrder), asc(sponsorTiers.createdAt));
  const all = await db
    .select()
    .from(sponsors)
    .where(eq(sponsors.eventId, event.id))
    .orderBy(desc(sponsors.createdAt));

  return (
    <SponsorsEditor
      eventId={event.id}
      slug={event.slug}
      uploads={Boolean(env.blobToken)}
      sponsors={all}
      tiers={tiers.map((t) => ({
        id: t.id,
        name: t.name,
        benefits: t.benefits ?? "",
        price: t.pricePaise == null ? "" : String(t.pricePaise / 100),
        slots: t.slots == null ? "" : String(t.slots),
        showInHero: t.showInHero,
        active: t.active,
        approved: all.filter((s) => s.tierId === t.id && s.status === "APPROVED").length,
      }))}
    />
  );
}
