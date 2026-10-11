import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDateRange } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { getEventBySlug } from "@/server/events";
import { getSponsorship } from "@/server/sponsors";
import { SponsorForm } from "./sponsor-form";

export const metadata = { title: "Become a sponsor" };

type Props = PageProps<"/events/[slug]/sponsor">;

async function Sponsor({ params, searchParams }: Props) {
  const { slug } = await params;
  const user = await requireUser(`/events/${slug}/sponsor`);
  const event = await getEventBySlug(slug);
  if (!event || (event.status === "DRAFT" && !user.isAdmin)) notFound();

  const { tiers } = await getSponsorship(event.id);
  const open = tiers.filter((t) => t.active);
  const available = open.filter((t) => t.remaining !== 0);
  const wanted = (await searchParams).level;
  const chosen = available.find((t) => t.id === (Array.isArray(wanted) ? wanted[0] : wanted)) ?? available[0];
  const closed = event.status === "CANCELLED" || event.endsAt < new Date();

  return (
    <div className="mx-auto max-w-3xl" style={{ "--event-accent": event.accentColor } as React.CSSProperties}>
      <Button asChild variant="link" className="h-auto p-0 text-white/60 hover:text-white">
        <Link href={`/events/${event.slug}#sponsors`}>← Back to event</Link>
      </Button>
      <p className="mt-6 text-sm font-bold tracking-[0.25em] text-(--event-accent) uppercase">
        Sponsorship
      </p>
      <h1 className="display mt-2 text-5xl sm:text-6xl">Sponsor {event.title}</h1>
      <p className="mt-3 mb-10 text-white/70">
        {formatDateRange(event.startsAt, event.endsAt, event.timezone)} ·{" "}
        {[event.venueName, event.city].filter(Boolean).join(", ")}
      </p>
      {closed || !chosen ? (
        <Alert className="p-6">
          <AlertTitle className="text-lg">
            {closed
              ? "This event is no longer taking sponsors."
              : open.length === 0
                ? "This event is not taking sponsorship requests at the moment."
                : "Every sponsorship level has been taken."}
          </AlertTitle>
        </Alert>
      ) : (
        <SponsorForm
          eventId={event.id}
          slug={event.slug}
          eventTitle={event.title}
          defaultLevelId={chosen.id}
          user={{ name: user.name, email: user.email }}
          levels={open.map((t) => ({
            id: t.id,
            disabled: t.remaining === 0,
            label: `${t.name} — ${t.pricePaise == null ? "price on request" : formatAmount(t.pricePaise)}${
              t.remaining === 0 ? " (taken)" : ""
            }`,
          }))}
        />
      )}
    </div>
  );
}

export default function SponsorPage(props: Props) {
  return (
    <>
      <SiteHeader />
      <main className="container-page grow py-10">
        <Suspense fallback={<div className="h-96" />}>
          <Sponsor {...props} />
        </Suspense>
      </main>
    </>
  );
}
