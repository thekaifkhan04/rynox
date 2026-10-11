import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { MapPin } from "lucide-react";
import { EventHero } from "@/components/event-hero";
import { ScrollMarquee } from "@/components/motion/gsap";
import { Reveal, ScrollProgress } from "@/components/motion/reveal";
import { SiteHeader } from "@/components/site-header";
import { HeroSponsors, SponsorshipSection } from "@/components/sponsorship";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";
import { getUser } from "@/lib/session";
import { getAvailability, registrationState } from "@/server/availability";
import { getEventBySlug } from "@/server/events";
import { getSponsorship } from "@/server/sponsors";
import { safeUrl } from "@/sections/registry";
import { RenderSection } from "@/sections/render";

export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status === "DRAFT") return { title: "Event" };
  return {
    title: event.title,
    description: event.summary ?? event.tagline ?? undefined,
    openGraph: event.coverImageUrl ? { images: [event.coverImageUrl] } : undefined,
  };
}

async function EventContent({ params }: Pick<PageProps<"/events/[slug]">, "params">) {
  const { slug } = await params;
  await connection();
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  // Drafts are visible to admins only, which is what powers the editor preview.
  if (event.status === "DRAFT" && !(await getUser())?.isAdmin) notFound();

  const availability = await getAvailability(event.id);
  const sponsorship = await getSponsorship(event.id);
  const registration = registrationState(event);
  const soldOut =
    availability.eventRemaining === 0 ||
    event.ticketTypes.filter((t) => t.active).every((t) => availability.byType[t.id] === 0);
  const sections = event.sections.filter((s) => s.visible);
  const hasTickets = sections.some((s) => s.type === "tickets");
  const ctx = { event, availability, registration };
  // "Run • Lift • Carry" becomes the moving band of words; otherwise the title is used.
  const taglineWords = (event.tagline ?? "").split(/\s*[•·|,/]\s*|\.\s+/).map((w) => w.replace(/\.$/, "").trim()).filter(Boolean);
  const marqueeWords = taglineWords.length > 1 ? taglineWords : [event.title];

  return (
    <div style={{ "--event-accent": event.accentColor } as React.CSSProperties}>
      {/* Inside the wrapper so the bar takes the event's colour. */}
      <ScrollProgress />
      {event.status === "DRAFT" && (
        <p className="relative z-30 bg-amber-400 px-4 py-1.5 text-center text-sm font-semibold text-black">
          Draft preview. Only admins can see this page.
        </p>
      )}
      <EventHero
        event={event}
        cta={
          !registration.open
            ? { disabled: registration.reason }
            : soldOut
              ? { disabled: "Sold out" }
              : {
                  href: hasTickets ? "#tickets" : `/events/${event.slug}/register`,
                  label: "Register",
                }
        }
      >
        <HeroSponsors sponsorship={sponsorship} />
      </EventHero>

      {event.summary && (
        <Reveal>
          <section className="container-page pt-6 pb-4">
            <p className="max-w-3xl text-xl leading-relaxed text-white/85 sm:text-2xl">
              {event.summary}
            </p>
          </section>
        </Reveal>
      )}

      <ScrollMarquee words={marqueeWords} />

      {sections.map((s) => (
        <RenderSection key={s.id} section={s} ctx={ctx} />
      ))}

      <Reveal>
        <SponsorshipSection
          sponsorship={sponsorship}
          slug={event.slug}
          acceptingSponsors={event.status !== "CANCELLED" && event.endsAt > new Date()}
        />
      </Reveal>

      <Reveal>
      <section className="container-page py-12 sm:py-16">
        <Card className="rounded-none bg-transparent [--card-spacing:--spacing(6)]">
          <CardContent className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <h2 className="display text-3xl">Where & when</h2>
            <p className="mt-3 flex items-start gap-2 text-lg">
              <MapPin className="mt-1 size-5 shrink-0 text-(--event-accent)" aria-hidden />
              <span>
                {event.venueName}
                {event.venueAddress ? `, ${event.venueAddress}` : ""}
                {event.city ? `, ${event.city}` : ""}
              </span>
            </p>
            <p className="mt-2 text-white/70">
              {formatDateTime(event.startsAt, event.timezone)} to{" "}
              {formatDateTime(event.endsAt, event.timezone)}
            </p>
            {safeUrl(event.mapUrl) && (
              <Button asChild variant="link" className="mt-1 h-auto p-0 text-(--event-accent)">
                <a href={safeUrl(event.mapUrl)!} target="_blank" rel="noopener noreferrer">
                  Open in maps
                </a>
              </Button>
            )}
          </div>
          {registration.open && !soldOut && (
            <Button asChild variant="accent" size="2xl">
              <Link href={`/events/${event.slug}/register`}>Register now</Link>
            </Button>
          )}
          </CardContent>
        </Card>
      </section>
      </Reveal>
    </div>
  );
}

export default function EventPage({ params }: PageProps<"/events/[slug]">) {
  return (
    <>
      <SiteHeader overlay />
      <Suspense fallback={<div className="min-h-[88svh]" />}>
        <EventContent params={params} />
      </Suspense>
    </>
  );
}
