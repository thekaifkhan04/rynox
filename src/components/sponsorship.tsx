import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { StaggerItem, StaggerList } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { Sponsor } from "@/db/schema";
import { formatAmount } from "@/lib/money";
import type { Sponsorship } from "@/server/sponsors";
import { safeUrl } from "@/sections/registry";

/** A sponsor's logo, or their name set in the display face when there is no logo. */
export function SponsorMark({
  sponsor,
  size,
}: {
  sponsor: Pick<Sponsor, "companyName" | "logoUrl" | "website">;
  size: "sm" | "md" | "lg";
}) {
  const logo = safeUrl(sponsor.logoUrl);
  const href = safeUrl(sponsor.website);
  const height = { sm: "h-7 sm:h-8", md: "h-10 sm:h-12", lg: "h-14 sm:h-20" }[size];
  const text = { sm: "text-lg sm:text-xl", md: "text-2xl sm:text-3xl", lg: "text-4xl sm:text-5xl" }[size];
  const mark = logo ? (
    <img src={logo} alt={sponsor.companyName} loading="lazy" className={`${height} w-auto max-w-56 object-contain`} />
  ) : (
    <span className={`display ${text}`}>{sponsor.companyName}</span>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer sponsored" className="inline-block transition hover:opacity-80">
      {mark}
    </a>
  ) : (
    mark
  );
}

/** The strip inside the hero naming the sponsors whose level is shown there. */
export function HeroSponsors({ sponsorship }: { sponsorship: Sponsorship }) {
  if (sponsorship.hero.length === 0) return null;
  const top = sponsorship.hero[0].tier;
  // The highest level gets its own line; everyone else shares a quieter row.
  const lead = sponsorship.hero.filter((h) => h.tier.id === top.id);
  const others = sponsorship.hero.filter((h) => h.tier.id !== top.id).slice(0, 8);
  return (
    <div className="hero-in mt-10 [animation-delay:640ms]">
      <p className="text-xs font-semibold tracking-[0.25em] text-white/65 uppercase">{top.name}</p>
      <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
        {lead.map(({ sponsor }) => (
          <li key={sponsor.id}>
            <SponsorMark sponsor={sponsor} size="md" />
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-white/80">
          {others.map(({ sponsor }) => (
            <li key={sponsor.id}>
              <SponsorMark sponsor={sponsor} size="sm" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The sponsors section of an event page: who is sponsoring, level by level,
 * and the levels still open to new sponsors.
 */
export function SponsorshipSection({
  sponsorship,
  slug,
  acceptingSponsors,
}: {
  sponsorship: Sponsorship;
  slug: string;
  acceptingSponsors: boolean;
}) {
  const withSponsors = sponsorship.tiers.filter((t) => t.sponsors.length > 0);
  const open = acceptingSponsors ? sponsorship.tiers.filter((t) => t.active) : [];
  if (withSponsors.length === 0 && open.length === 0) return null;

  return (
    <section id="sponsors" className="container-page scroll-mt-8 py-12 sm:py-16">
      <h2 className="display text-4xl sm:text-5xl">Sponsors</h2>

      {withSponsors.map((tier, i) => (
        <div key={tier.id} className="mt-10 text-center">
          <h3 className="text-sm font-semibold tracking-[0.25em] text-white/60 uppercase">{tier.name}</h3>
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
            {tier.sponsors.map((s) => (
              <li key={s.id}>
                <SponsorMark sponsor={s} size={i === 0 ? "lg" : i === 1 ? "md" : "sm"} />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {open.length > 0 && (
        <div className={withSponsors.length > 0 ? "mt-16" : "mt-6"}>
          <h3 className="display text-3xl">Sponsor this event</h3>
          <p className="mt-2 max-w-2xl text-white/70">
            Put your brand in front of the athletes and the crowd. Pick a level and send a request;
            the organisers will get back to you.
          </p>
          <StaggerList className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {open.map((tier) => {
              const full = tier.remaining === 0;
              const benefits = (tier.benefits ?? "").split("\n").map((b) => b.trim()).filter(Boolean);
              return (
                <StaggerItem lift key={tier.id}>
                  <Card className="h-full rounded-none [--card-spacing:--spacing(6)]">
                    <CardContent className="grow">
                      <div className="flex items-start justify-between gap-3">
                        <p className="display text-2xl">{tier.name}</p>
                        {tier.remaining != null && (
                          <Badge variant="outline" className="shrink-0">
                            {full ? "Taken" : `${tier.remaining} left`}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-4 text-3xl font-extrabold">
                        {tier.pricePaise == null ? "On request" : formatAmount(tier.pricePaise)}
                      </p>
                      {benefits.length > 0 && (
                        <ul className="mt-5 space-y-2 text-base text-white/80">
                          {benefits.map((b) => (
                            <li key={b} className="flex gap-2">
                              <Check className="mt-1 size-4 shrink-0 text-(--event-accent)" aria-hidden />
                              {b}
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                    <CardFooter>
                      {full ? (
                        <Button variant="outline" size="xl" className="w-full" disabled>
                          Fully taken
                        </Button>
                      ) : (
                        <Button asChild variant="accent" size="xl" className="w-full">
                          <Link href={`/events/${slug}/sponsor?level=${tier.id}`}>
                            Become a sponsor <ArrowRight />
                          </Link>
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                </StaggerItem>
              );
            })}
          </StaggerList>
        </div>
      )}
    </section>
  );
}
