import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroCountdown } from "@/components/countdown";
import { HeroParallax } from "@/components/motion/gsap";
import { Button } from "@/components/ui/button";
import type { Event } from "@/db/schema";
import { formatDateRange } from "@/lib/dates";
import { safeUrl } from "@/sections/registry";

export function EventHero({
  event,
  cta,
  children,
}: {
  /** Shown under the button, inside the hero (the sponsors strip). */
  children?: React.ReactNode;
  event: Event;
  cta: { href: string; label: string } | { disabled: string };
}) {
  const cover = safeUrl(event.coverImageUrl);
  return (
    <HeroParallax>
    <section className="relative flex min-h-[88svh] items-center justify-center overflow-hidden px-5 pt-24 pb-16 text-center">
      {cover ? (
        <img
          data-hero-bg
          src={cover}
          alt=""
          className="absolute inset-0 h-full w-full object-cover will-change-transform"
        />
      ) : (
        <div
          data-hero-bg
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `radial-gradient(120% 80% at 50% 0%, color-mix(in oklab, ${event.accentColor} 45%, #0b0b0d), #0b0b0d 70%)`,
          }}
        />
      )}
      {/* Darkens the photo for legible text and fades it into the page. */}
      <div aria-hidden className="absolute inset-0 bg-black/45" />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-background to-transparent"
      />
      <div data-hero-content className="relative z-10 max-w-5xl">
        {event.tagline && (
          <p className="hero-in mb-4 text-sm font-bold tracking-[0.25em] text-(--event-accent) uppercase sm:text-base">
            {event.tagline}
          </p>
        )}
        <h1 className="hero-in display [animation-delay:120ms] text-6xl text-balance sm:text-8xl lg:text-9xl">{event.title}</h1>
        <p className="hero-in mt-8 [animation-delay:260ms] text-2xl font-semibold sm:text-4xl">
          {event.city || event.venueName}
        </p>
        <p className="hero-in mt-3 [animation-delay:340ms] text-xl font-semibold sm:text-3xl">
          {formatDateRange(event.startsAt, event.endsAt, event.timezone)}
        </p>
        <div className="hero-in mt-8 [animation-delay:400ms]">
          <HeroCountdown target={event.startsAt.toISOString()} />
        </div>
        <div className="hero-in mt-8 [animation-delay:520ms]">
          {"href" in cta ? (
            <Button asChild size="2xl">
              <Link href={cta.href}>
                {cta.label} <ArrowRight />
              </Link>
            </Button>
          ) : (
            <Button size="2xl" variant="hero" disabled className="disabled:opacity-70">
              {cta.disabled}
            </Button>
          )}
        </div>
        {children}
      </div>
    </section>
    </HeroParallax>
  );
}
