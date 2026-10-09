import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Search } from "lucide-react";
import { EventCard } from "@/components/event-card";
import { Reveal, StaggerList } from "@/components/motion/reveal";
import { SimpleSelect } from "@/components/simple-select";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listPublicEvents, type PublicEvent } from "@/server/events";

export const metadata: Metadata = {
  title: "Events",
  description: "Browse upcoming competitions and register for the ones you want to enter.",
};

type Props = Pick<PageProps<"/events">, "searchParams">;

const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();

function matches(event: PublicEvent, q: string) {
  if (!q) return true;
  const haystack = [
    event.title,
    event.tagline,
    event.summary,
    event.city,
    event.venueName,
    ...event.competitions.map((c) => c.name),
    ...event.ticketTypes.map((t) => t.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  // Every word typed has to appear somewhere.
  return q.toLowerCase().split(/\s+/).every((word) => haystack.includes(word));
}

async function EventsList({ searchParams }: Props) {
  const sp = await searchParams;
  await connection();
  const now = new Date();
  const q = one(sp.q);
  const city = one(sp.city);
  const when = one(sp.when) === "past" ? "past" : one(sp.when) === "all" ? "all" : "upcoming";

  const all = await listPublicEvents();
  const cities = [...new Set(all.map((e) => e.city).filter((c): c is string => Boolean(c)))].sort();
  const filtered = all.filter(
    (e) =>
      matches(e, q) &&
      (!city || city === "all" || e.city === city) &&
      (when === "all" || (when === "past" ? e.endsAt < now : e.endsAt >= now)),
  );
  // Soonest first for what is coming, most recent first for what has been.
  const events = when === "past" ? [...filtered].reverse() : filtered;
  const filtering = Boolean(q || (city && city !== "all") || when !== "upcoming");

  return (
    <>
      <form method="get" className="mt-10 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="q">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/50" aria-hidden />
            <Input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Event, city or competition"
              className="h-10 pl-9"
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="city">City</Label>
          <SimpleSelect
            id="city"
            name="city"
            className="h-10! w-full sm:w-44"
            defaultValue={city || "all"}
            options={[{ value: "all", label: "All cities" }, ...cities.map((c) => ({ value: c, label: c }))]}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="when">When</Label>
          <SimpleSelect
            id="when"
            name="when"
            className="h-10! w-full sm:w-40"
            defaultValue={when}
            options={[
              { value: "upcoming", label: "Upcoming" },
              { value: "past", label: "Past" },
              { value: "all", label: "All dates" },
            ]}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="h-10 px-5 font-bold">
            Show events
          </Button>
          {filtering && (
            <Button asChild variant="ghost" className="h-10">
              <Link href="/events">Clear</Link>
            </Button>
          )}
        </div>
      </form>

      <p className="mt-8 text-sm text-white/60" role="status">
        {events.length} {when === "all" ? "" : `${when} `}event{events.length === 1 ? "" : "s"}
        {q && ` matching “${q}”`}
        {city && city !== "all" && ` in ${city}`}
      </p>

      {events.length === 0 ? (
        <Card className="mt-4 rounded-none bg-transparent text-center">
          <CardContent className="py-10">
            <p className="display text-3xl">
              {filtering ? "Nothing matches that" : "Nothing on the calendar yet"}
            </p>
            <p className="mt-3 text-white/70">
              {filtering
                ? "Try a different search, another city, or look at all dates."
                : "New events are announced here. Check back soon."}
            </p>
            {filtering && (
              <Button asChild size="xl" className="mt-6">
                <Link href="/events?when=all">Show all events</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <StaggerList className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <EventCard key={e.id} event={e} now={now} detailed />
          ))}
        </StaggerList>
      )}
    </>
  );
}

export default function EventsPage({ searchParams }: PageProps<"/events">) {
  return (
    <>
      <SiteHeader />
      <main className="container-page grow py-12 sm:py-16">
        <Reveal>
          <p className="text-sm font-bold tracking-[0.25em] text-(--event-accent) uppercase">
            The calendar
          </p>
          <h1 className="display mt-3 text-6xl sm:text-8xl">Events</h1>
          <p className="mt-5 max-w-2xl text-lg text-white/75">
            Every competition we run. Some are a single challenge you work through level by level;
            others hold several contests you can enter separately. Pick one and register.
          </p>
        </Reveal>
        <Suspense fallback={<div className="mt-10 h-[60vh]" />}>
          <EventsList searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}
