import Link from "next/link";
import Markdown from "react-markdown";
import { ArrowRight } from "lucide-react";
import { Countdown } from "@/components/countdown";
import { CountUp } from "@/components/motion/gsap";
import { Reveal, StaggerItem, StaggerList } from "@/components/motion/reveal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { EventSection } from "@/db/schema";
import { formatPaise } from "@/lib/money";
import type { Availability, RegistrationState } from "@/server/availability";
import type { EventWithDetails } from "@/server/events";
import {
  embedUrl,
  isSectionType,
  safeUrl,
  SECTION_SCHEMAS,
  type SectionContent,
} from "./registry";

export type SectionContext = {
  event: EventWithDetails;
  availability: Availability;
  registration: RegistrationState;
};

function Heading({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <h2 className="display text-4xl sm:text-5xl">{children}</h2>;
}

/** Raw HTML in markdown is not rendered, so admin-entered text cannot inject markup. */
function Prose({ children }: { children: string }) {
  return (
    <div className="prose-event">
      <Markdown
        components={{
          a: ({ href, children }) => (
            <a href={safeUrl(href) ?? "#"} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div
      className="flex h-full w-full items-end bg-[linear-gradient(135deg,#1c1c20,#101013)] p-4"
      aria-hidden
    >
      <span className="display text-5xl text-white/10">{label.slice(0, 12)}</span>
    </div>
  );
}

function Cards({ c }: { c: SectionContent<"cards"> }) {
  if (c.cards.length === 0) return null;
  return (
    <section className="py-12 sm:py-16">
      <div className="px-5 sm:px-8">
        <h2 className="text-2xl font-bold sm:text-3xl">{c.heading}</h2>
      </div>
      <StaggerList className="mt-6 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 sm:gap-8 sm:px-8 lg:grid lg:grid-cols-4 lg:overflow-visible">
        {c.cards.map((card, i) => (
          <StaggerItem lift
            key={i}
            className="relative aspect-[4/5] w-[70vw] max-w-xs shrink-0 snap-start overflow-hidden bg-card sm:w-72 lg:w-auto lg:max-w-none"
          >
            {safeUrl(card.imageUrl) ? (
              <img
                src={safeUrl(card.imageUrl)!}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <Placeholder label={card.title} />
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-4 pt-16 text-center">
              <p className="display text-2xl">{card.title}</p>
              {card.subtitle && <p className="mt-1 text-sm text-white/70">{card.subtitle}</p>}
            </div>
          </StaggerItem>
        ))}
      </StaggerList>
    </section>
  );
}

function CountdownSection({ c, ctx }: { c: SectionContent<"countdown">; ctx: SectionContext }) {
  const { event } = ctx;
  const target =
    c.target === "registrationClose" && event.registrationClosesAt
      ? event.registrationClosesAt
      : event.startsAt;
  return (
    <section className="container-page py-12 sm:py-16">
      <Countdown target={target.toISOString()} label={c.label || `Countdown to ${event.title}`} />
    </section>
  );
}

function RichText({ c }: { c: SectionContent<"richtext"> }) {
  return (
    <section className="container-page py-12 sm:py-16">
      <Heading>{c.heading}</Heading>
      <div className="mt-6 max-w-4xl">
        <Prose>{c.body}</Prose>
      </div>
    </section>
  );
}

function Feature({ c, ctx }: { c: SectionContent<"feature">; ctx: SectionContext }) {
  const href = safeUrl(c.buttonUrl) ?? `/events/${ctx.event.slug}/register`;
  const external = href.startsWith("http");
  return (
    <section className="container-page py-12 sm:py-16">
      <div className="grid items-center gap-8 md:grid-cols-2">
        <div className={`aspect-[16/10] overflow-hidden bg-card ${c.imageSide === "right" ? "md:order-2" : ""}`}>
          {safeUrl(c.imageUrl) ? (
            <img src={safeUrl(c.imageUrl)!} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <Placeholder label={c.heading} />
          )}
        </div>
        <div>
          {c.eyebrow && <p className="font-semibold text-(--event-accent)">{c.eyebrow}</p>}
          <h2 className="display mt-2 text-3xl sm:text-4xl">{c.heading}</h2>
          <div className="mt-4">
            <Prose>{c.body}</Prose>
          </div>
          {c.buttonLabel && (
            <Button asChild size="xl" className="mt-6">
              <Link href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {c.buttonLabel}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function Schedule({ c }: { c: SectionContent<"schedule"> }) {
  if (c.items.length === 0) return null;
  return (
    <section className="container-page py-12 sm:py-16">
      <Heading>{c.heading}</Heading>
      <ol className="mt-8 divide-y divide-white/10 border-y border-white/10">
        {c.items.map((item, i) => (
          <li key={i} className="grid gap-1 py-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
            <p className="font-mono text-sm font-semibold text-(--event-accent) sm:pt-1 sm:text-base">
              {item.time}
            </p>
            <div>
              <p className="text-lg font-bold">{item.title}</p>
              {item.description && <p className="mt-1 text-white/70">{item.description}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Tickets({ c, ctx }: { c: SectionContent<"tickets">; ctx: SectionContext }) {
  const { event, availability, registration } = ctx;
  const types = event.ticketTypes.filter((t) => t.active);
  if (types.length === 0) return null;
  // Ticket types are shown under the competition they enter; the rest are general entry.
  const groups = [
    ...event.competitions.map((competition) => ({
      competition: competition as (typeof event.competitions)[number] | null,
      types: types.filter((t) => t.competitionId === competition.id),
    })),
    { competition: null, types: types.filter((t) => !t.competitionId) },
  ].filter((g) => g.types.length > 0);
  // Headings only earn their place when a competition has levels to explain or
  // several ticket types under it; otherwise a plain grid reads better.
  const grouped = groups.some(
    (g) => g.competition && (g.competition.levels.length > 1 || g.types.length > 1),
  );
  // Without headings there is nothing to separate, so every ticket shares one grid.
  const rows = grouped ? groups : [{ competition: null, types }];
  return (
    <section id="tickets" className="container-page scroll-mt-8 py-12 sm:py-16">
      <Heading>{c.heading || "Tickets"}</Heading>
      {c.note && <p className="mt-3 max-w-2xl text-white/70">{c.note}</p>}
      {!registration.open && (
        <Badge variant="outline" className="mt-4 h-auto px-3 py-1.5 text-sm">
          {registration.reason}
        </Badge>
      )}
      {rows.map((group, i) => (
        <div key={group.competition?.id ?? "general"} className={i === 0 ? "mt-8" : "mt-12"}>
          {group.competition && grouped && (
            <div className="mb-5">
              <h3 className="display text-3xl">{group.competition.name}</h3>
              {group.competition.description && (
                <p className="mt-2 max-w-2xl text-white/70">{group.competition.description}</p>
              )}
              {group.competition.levels.length > 1 && (
                <ol
                  aria-label={`Levels of ${group.competition.name}`}
                  className="mt-4 flex flex-wrap items-center gap-2 text-sm"
                >
                  {group.competition.levels.map((level, n) => (
                    <li key={level.id} className="flex items-center gap-2">
                      {n > 0 && <ArrowRight className="size-4 text-white/40" aria-hidden />}
                      <Badge variant="outline" className="h-auto gap-1.5 px-3 py-1 text-sm" title={level.description ?? undefined}>
                        <span className="font-mono text-(--event-accent)">{n + 1}</span>
                        {level.name}
                      </Badge>
                    </li>
                  ))}
                </ol>
              )}
              {group.competition.levels.length > 1 && (
                <p className="mt-2 text-sm text-white/60">
                  One entry covers every level. You start at {group.competition.levels[0].name} and
                  qualify from each level to reach the next.
                </p>
              )}
            </div>
          )}
          {!group.competition && grouped && <h3 className="display mb-5 text-3xl">General entry</h3>}
          <StaggerList className={`grid gap-4 sm:grid-cols-2 ${columns(group.types.length)}`}>
            {group.types.map((t) => {
          const left = availability.byType[t.id];
          const soldOut = left === 0;
          const canBuy = registration.open && !soldOut;
          return (
            <StaggerItem lift key={t.id}>
              <Card className="h-full rounded-none [--card-spacing:--spacing(6)]">
                <CardContent className="grow">
              <p className="display text-2xl">{t.name}</p>
              {t.description && <p className="mt-2 text-sm text-white/70">{t.description}</p>}
              <p className="mt-6 text-4xl font-extrabold">{formatPaise(t.pricePaise)}</p>
              {t.offlinePricePaise != null && t.offlinePricePaise !== t.pricePaise && (
                <p className="mt-1 text-sm text-white/60">
                  Online price. {formatPaise(t.offlinePricePaise)} if you register offline.
                </p>
              )}
              <p className="mt-1 text-sm text-white/60">
                {soldOut
                  ? "Sold out"
                  : left != null && left <= 20
                    ? `Only ${left} left`
                    : left != null
                      ? `${left} seats left`
                      : "Seats available"}
              </p>
                </CardContent>
                <CardFooter>
                  {canBuy ? (
                    <Button asChild variant="accent" size="xl" className="w-full">
                      <Link href={`/events/${event.slug}/register?type=${t.id}`}>
                        Register <ArrowRight />
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="xl" className="w-full" disabled>
                      {soldOut ? "Sold out" : "Unavailable"}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            </StaggerItem>
          );
            })}
          </StaggerList>
        </div>
      ))}
    </section>
  );
}

function Stats({ c }: { c: SectionContent<"stats"> }) {
  if (c.items.length === 0) return null;
  return (
    <section className="container-page py-12 sm:py-16">
      <Heading>{c.heading}</Heading>
      <StaggerList
        as="dl"
        className={`grid grid-cols-2 gap-px bg-white/10 md:grid-cols-4 ${c.heading ? "mt-8" : ""}`}
      >
        {c.items.map((item, i) => (
          <StaggerItem as="div" key={i} className="bg-background px-4 py-8 text-center">
            <dd className="display text-5xl text-(--event-accent) sm:text-6xl">
              <CountUp value={item.value} />
            </dd>
            <dt className="mt-2 text-sm tracking-wide text-white/70 uppercase">{item.label}</dt>
          </StaggerItem>
        ))}
      </StaggerList>
    </section>
  );
}

function Faq({ c }: { c: SectionContent<"faq"> }) {
  if (c.items.length === 0) return null;
  return (
    <section className="container-page py-12 sm:py-16">
      <Heading>{c.heading}</Heading>
      <Accordion type="single" collapsible className="mt-6 max-w-3xl">
        {c.items.map((item, i) => (
          <AccordionItem key={i} value={`q${i}`}>
            <AccordionTrigger className="text-left text-lg font-semibold">
              {item.question}
            </AccordionTrigger>
            <AccordionContent>
              <Prose>{item.answer}</Prose>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function Gallery({ c }: { c: SectionContent<"gallery"> }) {
  const images = c.images.filter((i) => safeUrl(i.imageUrl));
  if (images.length === 0) return null;
  return (
    <section className="container-page py-12 sm:py-16">
      <Heading>{c.heading}</Heading>
      <StaggerList className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">
        {images.map((img, i) => (
          <StaggerItem key={i} className="aspect-square overflow-hidden bg-card">
            <img
              src={safeUrl(img.imageUrl)!}
              alt={img.caption}
              loading="lazy"
              className="h-full w-full object-cover transition duration-500 hover:scale-105"
            />
          </StaggerItem>
        ))}
      </StaggerList>
    </section>
  );
}

function Sponsors({ c }: { c: SectionContent<"sponsors"> }) {
  const logos = c.logos.filter((l) => safeUrl(l.imageUrl) || l.name);
  if (logos.length === 0) return null;
  return (
    <section className="container-page py-12 sm:py-16">
      <h2 className="text-center text-sm font-semibold tracking-[0.2em] text-white/60 uppercase">
        {c.heading}
      </h2>
      <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
        {logos.map((l, i) => {
          const inner = safeUrl(l.imageUrl) ? (
            <img src={safeUrl(l.imageUrl)!} alt={l.name} loading="lazy" className="h-10 w-auto opacity-80 sm:h-12" />
          ) : (
            <span className="display text-2xl text-white/70">{l.name}</span>
          );
          const href = safeUrl(l.url);
          return (
            <li key={i}>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {inner}
                </a>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Embed({ c }: { c: SectionContent<"embed"> }) {
  const src = embedUrl(c.url);
  if (!src) return null;
  return (
    <section className="container-page py-12 sm:py-16">
      <Heading>{c.heading}</Heading>
      <div className={`aspect-video overflow-hidden bg-card ${c.heading ? "mt-8" : ""}`}>
        <iframe
          src={src}
          title={c.heading || c.caption || "Embedded content"}
          loading="lazy"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full w-full border-0"
        />
      </div>
      {c.caption && <p className="mt-3 text-sm text-white/60">{c.caption}</p>}
    </section>
  );
}

/** Four across when that fills the rows evenly, otherwise three. */
function columns(count: number) {
  return count % 4 === 0 ? "lg:grid-cols-4" : "lg:grid-cols-3";
}

function Steps({ c }: { c: SectionContent<"steps"> }) {
  if (c.items.length === 0) return null;
  return (
    <section className="container-page py-12 sm:py-16">
      <Heading>{c.heading}</Heading>
      {c.intro && <p className="mt-3 max-w-2xl text-lg text-white/70">{c.intro}</p>}
      <StaggerList as="ol" className={`mt-8 grid gap-4 sm:grid-cols-2 ${columns(c.items.length)}`}>
        {c.items.map((item, i) => (
          <StaggerItem lift key={i}>
            <Card className="h-full rounded-none [--card-spacing:--spacing(6)]">
              <CardContent>
                <p className="display text-6xl text-(--event-accent)" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="mt-4 text-xl font-bold">{item.title}</p>
                {item.description && <p className="mt-2 text-base text-white/70">{item.description}</p>}
              </CardContent>
            </Card>
          </StaggerItem>
        ))}
      </StaggerList>
    </section>
  );
}

function Highlights({ c }: { c: SectionContent<"highlights"> }) {
  if (c.items.length === 0) return null;
  return (
    <section className="container-page py-12 sm:py-16">
      <Heading>{c.heading}</Heading>
      {c.intro && <p className="mt-3 max-w-2xl text-lg text-white/70">{c.intro}</p>}
      <StaggerList className={`mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 ${columns(c.items.length)}`}>
        {c.items.map((item, i) => (
          <StaggerItem key={i} className="border-l-2 border-(--event-accent) pl-5">
            <p className="text-xl font-bold">{item.title}</p>
            {item.description && <p className="mt-2 text-white/70">{item.description}</p>}
          </StaggerItem>
        ))}
      </StaggerList>
    </section>
  );
}

function Prizes({ c }: { c: SectionContent<"prizes"> }) {
  if (c.items.length === 0) return null;
  return (
    <section className="container-page py-12 sm:py-16">
      <Heading>{c.heading}</Heading>
      {c.note && <p className="mt-3 max-w-2xl text-lg text-white/70">{c.note}</p>}
      <StaggerList className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {c.items.map((item, i) => (
          <StaggerItem lift key={i}>
            <Card className={`h-full rounded-none [--card-spacing:--spacing(6)] ${i === 0 ? "ring-2 ring-(--event-accent)" : ""}`}>
              <CardContent className="text-center">
                <Badge variant="outline" className="h-auto px-3 py-1 text-sm">
                  {item.place}
                </Badge>
                <p className="display mt-4 text-5xl">{item.amount}</p>
                {item.description && <p className="mt-3 text-white/70">{item.description}</p>}
              </CardContent>
            </Card>
          </StaggerItem>
        ))}
      </StaggerList>
    </section>
  );
}

function Testimonials({ c }: { c: SectionContent<"testimonials"> }) {
  const items = c.items.filter((i) => i.quote);
  if (items.length === 0) return null;
  return (
    <section className="container-page py-12 sm:py-16">
      <Heading>{c.heading}</Heading>
      <StaggerList className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <StaggerItem lift key={i}>
            <Card className="h-full rounded-none [--card-spacing:--spacing(6)]">
              <CardContent className="grow">
                <blockquote className="text-lg leading-relaxed text-white/85">“{item.quote}”</blockquote>
              </CardContent>
              <CardFooter className="gap-3">
                <Avatar>
                  {safeUrl(item.imageUrl) && <AvatarImage src={safeUrl(item.imageUrl)!} alt="" />}
                  <AvatarFallback>{item.name.slice(0, 1).toUpperCase() || "?"}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{item.name}</p>
                  {item.role && <p className="text-sm text-white/60">{item.role}</p>}
                </div>
              </CardFooter>
            </Card>
          </StaggerItem>
        ))}
      </StaggerList>
    </section>
  );
}

function Cta({ c, ctx }: { c: SectionContent<"cta">; ctx: SectionContext }) {
  const href = safeUrl(c.buttonUrl) ?? `/events/${ctx.event.slug}/register`;
  const external = href.startsWith("http");
  return (
    <section className="container-page py-12 sm:py-16">
      <div className="flex flex-col items-start justify-between gap-6 bg-(--event-accent) p-8 text-background sm:p-12 md:flex-row md:items-center">
        <div>
          <h2 className="display text-4xl sm:text-6xl">{c.heading}</h2>
          {c.text && <p className="mt-3 max-w-xl text-lg font-medium">{c.text}</p>}
        </div>
        {c.buttonLabel && (
          <Button
            asChild
            size="2xl"
            className="bg-background text-white hover:bg-background/85"
          >
            <Link href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {c.buttonLabel} <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}

function SectionBody({ section, ctx }: { section: EventSection; ctx: SectionContext }) {
  if (!isSectionType(section.type)) return null;
  // Content that no longer matches its schema is skipped rather than breaking the page.
  const parsed = SECTION_SCHEMAS[section.type].safeParse(section.content);
  if (!parsed.success) return null;
  const c = parsed.data as never;
  switch (section.type) {
    case "cards":
      return <Cards c={c} />;
    case "countdown":
      return <CountdownSection c={c} ctx={ctx} />;
    case "richtext":
      return <RichText c={c} />;
    case "feature":
      return <Feature c={c} ctx={ctx} />;
    case "schedule":
      return <Schedule c={c} />;
    case "tickets":
      return <Tickets c={c} ctx={ctx} />;
    case "stats":
      return <Stats c={c} />;
    case "faq":
      return <Faq c={c} />;
    case "gallery":
      return <Gallery c={c} />;
    case "sponsors":
      return <Sponsors c={c} />;
    case "embed":
      return <Embed c={c} />;
    case "steps":
      return <Steps c={c} />;
    case "highlights":
      return <Highlights c={c} />;
    case "prizes":
      return <Prizes c={c} />;
    case "testimonials":
      return <Testimonials c={c} />;
    case "cta":
      return <Cta c={c} ctx={ctx} />;
  }
}

/** A landing-page section, revealed as it scrolls into view. */
export function RenderSection(props: { section: EventSection; ctx: SectionContext }) {
  return (
    <Reveal>
      <SectionBody {...props} />
    </Reveal>
  );
}
