import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { HeroCountdown } from "@/components/countdown";
import { EventCard } from "@/components/event-card";
import { CountUp, HeroParallax, ScrollMarquee } from "@/components/motion/gsap";
import { Reveal, ScrollProgress, StaggerItem, StaggerList } from "@/components/motion/reveal";
import { SiteHeader } from "@/components/site-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateRange } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { listPublicEvents, pickFeatured, type PublicEvent } from "@/server/events";
import { safeUrl } from "@/sections/registry";

/**
 * The home page is the brand's front door, deliberately unlike an event
 * page: a typographic hero instead of a full-bleed photo, with the next
 * event as a card beside it.
 */

async function loadUpcoming() {
  await connection();
  const now = new Date();
  // `featured` is the event the organiser chose for this page, or else the next one.
  const { event: featured, chosenByOrganiser, upcoming } = pickFeatured(await listPublicEvents(), now);
  return { now, upcoming, featured, chosenByOrganiser };
}

/** The "next up" card that sits beside the headline. */
function NextUpCard({ event, label }: { event: PublicEvent; label: string }) {
  const prices = event.ticketTypes.map((t) => t.pricePaise);
  const from = prices.length ? Math.min(...prices) : null;
  const contests = event.competitions.slice(0, 4);
  return (
    // A frosted panel: the event's photo is already the hero background, so it is not repeated here.
    <article className="hero-in rounded-2xl border border-white/20 bg-black/45 p-6 shadow-2xl shadow-black/50 backdrop-blur-md [animation-delay:350ms] sm:p-8">
      <Badge className="bg-(--event-accent) font-bold tracking-wider text-background uppercase">
        {label}
      </Badge>
      <h2 className="display mt-5 text-5xl sm:text-6xl">{event.title}</h2>
      {event.tagline && <p className="mt-2 text-sm font-semibold tracking-[0.2em] text-(--event-accent) uppercase">{event.tagline}</p>}
      <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-white/85">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-4" aria-hidden />
          {formatDateRange(event.startsAt, event.endsAt, event.timezone)}
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin className="size-4" aria-hidden />
          {event.city || event.venueName}
        </span>
      </p>
      {contests.length > 1 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Competitions">
          {contests.map((c) => (
            <li key={c.id}>
              <Badge variant="outline" className="border-white/25 text-white/85">
                {c.name}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <HeroCountdown target={event.startsAt.toISOString()} compact className="mt-6 flex w-full bg-black/30" />
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-sm text-white/70">
          {from == null ? "" : from === 0 ? "Free entry" : (
            <>
              From <span className="text-xl font-bold text-white">{formatPaise(from)}</span>
            </>
          )}
        </p>
        <Button asChild variant="accent" size="xl">
          <Link href={`/events/${event.slug}`}>
            View event <ArrowRight />
          </Link>
        </Button>
      </div>
    </article>
  );
}

async function HeroSide() {
  const { featured: next, chosenByOrganiser } = await loadUpcoming();
  if (!next) {
    return (
      <Card className="hero-in rounded-2xl [animation-delay:350ms]">
        <CardContent className="py-10 text-center">
          <p className="display text-3xl">Nothing on the calendar yet</p>
          <p className="mt-3 text-white/70">New events are announced here. Check back soon.</p>
        </CardContent>
      </Card>
    );
  }
  return <NextUpCard event={next} label={chosenByOrganiser ? "Featured" : "Next up"} />;
}

/**
 * The photo behind the hero: the next event's cover, darkened so the headline
 * stays readable. It drifts and zooms as the page scrolls.
 */
async function HeroBackdrop() {
  const { upcoming, featured } = await loadUpcoming();
  // The featured event's photo, or the first upcoming one that has a photo.
  const cover =
    safeUrl(featured?.coverImageUrl) ??
    safeUrl(upcoming.find((e) => safeUrl(e.coverImageUrl))?.coverImageUrl);
  // The whole home page takes the featured event's colour, so the headline, card,
  // word band and buttons all match. Scoped to this page's wrapper so it cannot affect others.
  const accent = featured && /^#[0-9a-f]{6}$/i.test(featured.accentColor) ? featured.accentColor : null;
  return (
    <>
      {accent && <style>{`#home{--event-accent:${accent}}`}</style>}
      {cover && (
        <img
          src={cover}
          alt=""
          className="hero-fade h-full w-full object-cover object-[70%_center] brightness-[0.62]"
        />
      )}
    </>
  );
}

/** Real numbers from what is on the calendar right now. */
async function HeroNumbers() {
  const { upcoming } = await loadUpcoming();
  const cities = new Set(upcoming.map((e) => e.city).filter(Boolean)).size;
  const contests = upcoming.reduce((n, e) => n + Math.max(1, e.competitions.length), 0);
  const items = [
    { value: String(upcoming.length), label: upcoming.length === 1 ? "Upcoming event" : "Upcoming events" },
    { value: String(contests), label: contests === 1 ? "Competition to enter" : "Competitions to enter" },
    { value: String(cities), label: cities === 1 ? "City" : "Cities" },
  ];
  return (
    <dl className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col items-center gap-1 px-3 pt-6 sm:flex-row sm:justify-center sm:gap-4">
          <dd className="display text-4xl sm:text-5xl">
            <CountUp value={i.value} />
          </dd>
          <dt className="text-center text-xs tracking-wide text-white/60 uppercase sm:text-left sm:text-sm">
            {i.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}

async function UpcomingEvents() {
  const { now, upcoming } = await loadUpcoming();
  if (upcoming.length === 0) {
    return <p className="mt-6 text-white/60">No upcoming events right now.</p>;
  }
  return (
    <StaggerList className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {upcoming.slice(0, 6).map((e) => (
        <EventCard key={e.id} event={e} now={now} detailed />
      ))}
    </StaggerList>
  );
}

const formats = [
  {
    tag: "Level by level",
    title: "One challenge, several levels",
    text: "Everyone starts at level one. Clear it and you move up; the field narrows until the last level decides it. One entry covers the whole climb.",
    path: ["Level 1", "Level 2", "Level 3", "Final"],
    linked: true,
  },
  {
    tag: "Pick and choose",
    title: "Separate contests, enter what you like",
    text: "Some events hold several contests side by side. Enter one, or as many as you can handle. Each has its own start, its own field and its own result.",
    path: ["5K", "10K", "Half", "Full"],
    linked: false,
  },
];

const steps = [
  { title: "Pick your event", text: "Choose a competition and the category that fits you." },
  { title: "Register and pay", text: "Fill in your details and pay online. Your seat is held while you check out." },
  { title: "Get your QR ticket", text: "It lands in your inbox and in My tickets the moment payment is confirmed." },
  { title: "Scan in and compete", text: "One scan at the gate and you are in. Bring a photo ID." },
];

const faqs = [
  { q: "Do I need an account to register?", a: "Yes. Sign in with Google once, and all your tickets stay together in My tickets." },
  { q: "Where is my ticket after I pay?", a: "It is emailed to you with a PDF attached, and it is always available under My tickets on this site." },
  { q: "Can I register friends or teammates?", a: "For events that allow it, add more tickets in the same order and enter each person's details. Everyone gets their own QR code." },
  { q: "My payment went through but I see no ticket.", a: "Give it a minute and refresh My tickets. Payments are confirmed automatically, and if a seat could not be confirmed the amount is refunded." },
  { q: "Can my brand sponsor an event?", a: "Yes. Open the event you are interested in and go to its Sponsors section to see the levels on offer and send a request." },
];

export default function HomePage() {
  return (
    <div id="home">
      <ScrollProgress />
      <SiteHeader overlay />

      {/* Hero: big type over a darkened photo that moves with the scroll. */}
      <HeroParallax>
      <section
        id="home-hero"
        className="relative flex flex-col justify-center overflow-hidden pt-28 pb-10 lg:min-h-svh lg:pt-32"
      >
        {/* The moving layer is part of the page shell. Its grid shows until the photo streams in over it. */}
        <div data-hero-bg aria-hidden className="absolute inset-0 will-change-transform">
          <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:72px_72px]" />
          <div className="absolute inset-0">
            <Suspense fallback={null}>
              <HeroBackdrop />
            </Suspense>
          </div>
        </div>
        {/* Solid behind the headline on the left, clearing to show the photo on the right. */}
        <div
          aria-hidden
          className="absolute inset-0 [background:linear-gradient(90deg,var(--background)_0%,color-mix(in_oklab,var(--background)_88%,transparent)_30%,color-mix(in_oklab,var(--background)_35%,transparent)_62%,transparent_100%)] max-lg:[background:color-mix(in_oklab,var(--background)_72%,transparent)]"
        />
        {/* Shade under the header, and a fade into the page at the bottom. */}
        <div
          aria-hidden
          className="absolute inset-0 [background:linear-gradient(180deg,color-mix(in_oklab,var(--background)_70%,transparent)_0%,transparent_22%,transparent_62%,var(--background)_100%)]"
        />
        <div className="container-page relative grid items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <div>
            {/* A quiet label: a short rule and small caps, instead of a second loud line. */}
            <p className="hero-in flex items-center gap-3 text-xs font-semibold tracking-[0.28em] text-white/75 uppercase sm:text-sm">
              <span aria-hidden className="h-px w-10 bg-(--event-accent)" />
              Endurance · Strength · Grit
            </p>
            {/* Two lines, sized to the column, so the headline reads as one phrase. */}
            <h1 className="display mt-6 text-[clamp(3.75rem,17vw,6rem)] leading-[0.9] drop-shadow-[0_2px_24px_rgba(0,0,0,0.55)] sm:text-[clamp(5rem,11vw,7.5rem)] lg:text-[clamp(5.5rem,8.2vw,8.25rem)]">
              <span className="hero-in block [animation-delay:80ms]">Test your</span>
              <span className="hero-in relative block w-fit text-(--event-accent) [animation-delay:180ms]">
                limits
                <span
                  aria-hidden
                  className="absolute -bottom-2 left-0 h-1.5 w-full origin-left bg-(--event-accent) sm:-bottom-3 sm:h-2"
                />
              </span>
            </h1>
            <p className="hero-in mt-9 max-w-md text-base leading-relaxed text-white/80 [animation-delay:280ms] sm:mt-11 sm:text-lg">
              Races, lifts and endurance challenges you can enter in a couple of minutes. Pick an
              event, pay online and walk in with a QR ticket.
            </p>
            <div className="hero-in mt-8 flex flex-wrap gap-3 [animation-delay:380ms]">
              <Button asChild size="xl" className="h-12 px-7">
                <Link href="/events">
                  Browse events <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="xl" variant="ghost" className="h-12 px-5 text-white/85 hover:text-white">
                <Link href="#how-it-works">
                  How it works <ArrowDown />
                </Link>
              </Button>
            </div>
          </div>
          <Suspense fallback={<Skeleton className="aspect-[4/5] w-full rounded-2xl" />}>
            <HeroSide />
          </Suspense>
        </div>
        <div className="container-page relative mt-12 lg:mt-16">
          <Suspense fallback={<Skeleton className="h-28 w-full" />}>
            <HeroNumbers />
          </Suspense>
        </div>
      </section>
      </HeroParallax>

      <ScrollMarquee words={["Run", "Lift", "Carry", "Flip", "Crawl", "Outlast"]} />

      <section id="events" className="container-page scroll-mt-8 py-16">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold tracking-[0.25em] text-(--event-accent) uppercase">
                On the calendar
              </p>
              <h2 className="display mt-2 text-5xl sm:text-6xl">Upcoming events</h2>
            </div>
            <Button asChild variant="hero" className="h-10 px-4">
              <Link href="/events">
                All events <ArrowRight />
              </Link>
            </Button>
          </div>
        </Reveal>
        <Suspense fallback={<Skeleton className="mt-8 h-96 w-full" />}>
          <UpcomingEvents />
        </Suspense>
      </section>

      {/* Two formats, side by side. */}
      <section className="container-page py-16">
        <Reveal>
          <p className="text-sm font-bold tracking-[0.25em] text-(--event-accent) uppercase">
            Two ways to compete
          </p>
          <h2 className="display mt-2 max-w-3xl text-5xl sm:text-6xl">Climb the levels, or pick your contests</h2>
        </Reveal>
        <StaggerList className="mt-10 grid gap-6 lg:grid-cols-2">
          {formats.map((f) => (
            <StaggerItem key={f.tag} lift>
              <Card className="h-full rounded-2xl [--card-spacing:--spacing(7)]">
                <CardContent>
                  <Badge variant="outline" className="h-auto px-3 py-1 text-sm">
                    {f.tag}
                  </Badge>
                  <h3 className="mt-5 text-2xl font-bold sm:text-3xl">{f.title}</h3>
                  <p className="mt-3 text-base text-white/70">{f.text}</p>
                  <ol aria-hidden className="mt-8 flex flex-wrap items-center gap-2">
                    {f.path.map((step, i) => (
                      <li key={step} className="flex items-center gap-2">
                        {i > 0 &&
                          (f.linked ? (
                            <ArrowRight className="size-4 text-(--event-accent)" />
                          ) : (
                            <span className="text-white/30">+</span>
                          ))}
                        <span
                          className={`display rounded-lg border px-4 py-2 text-xl ${
                            f.linked && i === f.path.length - 1
                              ? "border-(--event-accent) bg-(--event-accent) text-background"
                              : "border-white/20"
                          }`}
                        >
                          {step}
                        </span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerList>
      </section>

      {/* A numbered line rather than cards. */}
      <section id="how-it-works" className="scroll-mt-8 border-y border-white/10 bg-card/40 py-16">
        <div className="container-page">
          <Reveal>
            <h2 className="display text-5xl sm:text-6xl">From sign-up to start line</h2>
          </Reveal>
          <StaggerList as="ol" className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
            {steps.map((s, i) => (
              <StaggerItem key={s.title} className="relative lg:pr-8">
                <div className="flex items-center gap-4">
                  <span className="display flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-(--event-accent) text-2xl text-(--event-accent)">
                    {i + 1}
                  </span>
                  {i < steps.length - 1 && (
                    <span aria-hidden className="hidden h-px grow bg-gradient-to-r from-(--event-accent) to-white/10 lg:block" />
                  )}
                </div>
                <h3 className="mt-5 text-xl font-bold">{s.title}</h3>
                <p className="mt-2 text-white/70">{s.text}</p>
              </StaggerItem>
            ))}
          </StaggerList>
        </div>
      </section>

      <section className="container-page grid gap-10 py-16 lg:grid-cols-[1fr_1.4fr]">
        <Reveal>
          <h2 className="display text-5xl sm:text-6xl">Questions</h2>
          <p className="mt-4 max-w-sm text-white/70">
            The short answers. Each event page has the details for that event.
          </p>
          <Button asChild variant="link" className="mt-4 h-auto p-0 text-base text-(--event-accent)">
            <Link href="/events">
              See the events <ArrowUpRight />
            </Link>
          </Button>
        </Reveal>
        <Reveal>
          <Accordion type="single" collapsible>
            {faqs.map((f, i) => (
              <AccordionItem key={f.q} value={`q${i}`}>
                <AccordionTrigger className="text-left text-lg font-semibold">{f.q}</AccordionTrigger>
                <AccordionContent className="text-base text-white/75">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </section>

      <Reveal>
        <section className="container-page pb-20">
          <div className="relative overflow-hidden rounded-3xl border border-white/15 px-6 py-16 text-center sm:py-24">
            <div
              aria-hidden
              className="absolute inset-0 [background:radial-gradient(60%_90%_at_50%_100%,color-mix(in_oklab,var(--event-accent)_45%,transparent),transparent_70%)]"
            />
            <div className="relative">
              <h2 className="display text-6xl sm:text-8xl">Your start line is waiting</h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/75">
                Categories fill up. Pick an event and lock in your place.
              </p>
              <Button asChild size="2xl" className="mt-8">
                <Link href="/events">
                  Find your event <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
