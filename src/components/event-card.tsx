import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import { StaggerItem } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { formatDateRange } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { registrationState } from "@/server/availability";
import type { PublicEvent } from "@/server/events";
import { safeUrl } from "@/sections/registry";

/** A short label for where the event stands today. */
export function eventBadge(event: PublicEvent, now: Date): { label: string; className: string } {
  if (event.endsAt < now) return { label: "Finished", className: "border-white/25 bg-black/60 text-white/70" };
  const state = registrationState(event, now);
  if (state.open) {
    return { label: "Registration open", className: "border-emerald-400/50 bg-emerald-500/20 text-emerald-200" };
  }
  if (event.registrationOpensAt && now < event.registrationOpensAt) {
    return { label: "Opening soon", className: "border-amber-400/50 bg-amber-500/20 text-amber-200" };
  }
  return { label: "Registration closed", className: "border-white/25 bg-black/60 text-white/80" };
}

/**
 * An event as a poster-style card. `detailed` adds the venue and the
 * competitions it holds, for the full events listing.
 */
export function EventCard({
  event,
  now,
  detailed = false,
}: {
  event: PublicEvent;
  now: Date;
  detailed?: boolean;
}) {
  const cover = safeUrl(event.coverImageUrl);
  const prices = event.ticketTypes.map((t) => t.pricePaise);
  const from = prices.length ? Math.min(...prices) : null;
  const badge = eventBadge(event, now);
  const levelled = event.competitions.some((c) => c.levels.length > 1);
  const shown = event.competitions.slice(0, 4);

  return (
    <StaggerItem lift>
      <Link href={`/events/${event.slug}`} className="group block h-full">
        <article className="relative aspect-[4/5] overflow-hidden bg-card">
          {cover ? (
            <img
              src={cover}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div
              aria-hidden
              className="h-full w-full"
              style={{
                background: `linear-gradient(160deg, color-mix(in oklab, ${event.accentColor} 55%, #0b0b0d), #0b0b0d 75%)`,
              }}
            />
          )}
          <Badge variant="outline" className={`absolute top-4 left-4 backdrop-blur ${badge.className}`}>
            {badge.label}
          </Badge>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-5 pt-24">
            <h3 className="display text-3xl">{event.title}</h3>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-white/85">
              <CalendarDays className="size-4 shrink-0" aria-hidden />
              {formatDateRange(event.startsAt, event.endsAt, event.timezone)}
            </p>
            {(detailed || event.city) && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-white/85">
                <MapPin className="size-4 shrink-0" aria-hidden />
                {detailed
                  ? [event.venueName, event.city].filter(Boolean).join(", ")
                  : event.city}
              </p>
            )}
            {detailed && shown.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Competitions">
                {shown.map((c) => (
                  <li key={c.id}>
                    <Badge variant="outline" className="border-white/25 bg-black/40 text-white/90">
                      {c.name}
                      {c.levels.length > 1 ? ` · ${c.levels.length} levels` : ""}
                    </Badge>
                  </li>
                ))}
                {event.competitions.length > shown.length && (
                  <li>
                    <Badge variant="outline" className="border-white/25 bg-black/40 text-white/90">
                      +{event.competitions.length - shown.length} more
                    </Badge>
                  </li>
                )}
              </ul>
            )}
            <p className="mt-3 text-sm font-semibold" style={{ color: event.accentColor }}>
              {from == null ? "Details soon" : from === 0 ? "Free entry" : `From ${formatPaise(from)}`}
              {detailed && event.competitions.length > 1 && (
                <span className="font-normal text-white/60"> · enter each separately</span>
              )}
              {detailed && event.competitions.length === 1 && levelled && (
                <span className="font-normal text-white/60"> · qualify level by level</span>
              )}
            </p>
          </div>
        </article>
      </Link>
    </StaggerItem>
  );
}
