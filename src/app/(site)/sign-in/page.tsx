import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowRight, QrCode, Ticket, Zap } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateRange } from "@/lib/dates";
import { devLogin, googleConfigured } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { getUser } from "@/lib/session";
import { listPublicEvents, pickFeatured } from "@/server/events";
import { safeUrl } from "@/sections/registry";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? "RYNOX";

type Search = Pick<PageProps<"/sign-in">, "searchParams">;

async function SignIn({ searchParams }: Search) {
  const next = safeNext((await searchParams).next);
  if (await getUser()) redirect(next);
  // Say why they were sent here, when it is obvious from where they were going.
  const reason = /^\/events\/[^/]+\/register/.test(next)
    ? "Sign in to finish registering. Your ticket will be saved to this account."
    : /^\/events\/[^/]+\/sponsor/.test(next)
      ? "Sign in to send your sponsorship request."
      : next.startsWith("/admin")
        ? "Sign in with your organiser account."
        : "Sign in to register for events and keep your tickets in one place.";
  return (
    <>
      <p className="mt-4 mb-8 text-lg text-white/70">{reason}</p>
      <SignInForm next={next} google={googleConfigured} devLogin={devLogin} />
    </>
  );
}

/** The picture side: the next event's cover, with a link to it. */
async function Showcase() {
  await connection();
  const now = new Date();
  const { event, chosenByOrganiser } = pickFeatured(await listPublicEvents(), now);
  const cover = safeUrl(event?.coverImageUrl);
  const accent = event?.accentColor ?? "#ff4d1c";
  return (
    <div className="absolute inset-0" style={{ "--event-accent": accent } as React.CSSProperties}>
      {cover ? (
        <img src={cover} alt="" className="hero-in h-full w-full object-cover" />
      ) : (
        <div
          aria-hidden
          className="h-full w-full"
          style={{ background: `radial-gradient(120% 90% at 30% 0%, color-mix(in oklab, ${accent} 55%, #0b0b0d), #0b0b0d 70%)` }}
        />
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-black/30" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-transparent to-background/80 max-lg:hidden" />
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10 lg:p-14">
        <p className="hero-in text-sm font-bold tracking-[0.25em] text-(--event-accent) uppercase [animation-delay:150ms]">
          Test your limits
        </p>
        <p className="hero-in display mt-3 max-w-xl text-5xl [animation-delay:250ms] sm:text-6xl lg:text-7xl">
          Your start line is waiting
        </p>
        {event && (
          <Link
            href={`/events/${event.slug}`}
            className="hero-in group mt-6 inline-flex max-w-full items-center gap-3 rounded-xl border border-white/20 bg-black/40 py-2.5 pr-4 pl-3 backdrop-blur-sm transition [animation-delay:380ms] hover:border-white/50 max-lg:hidden"
          >
            <span className="rounded-md bg-(--event-accent) px-2 py-1 text-xs font-bold text-background uppercase">
              {chosenByOrganiser ? "Featured" : "Next up"}
            </span>
            <span className="truncate text-sm">
              <strong className="font-bold">{event.title}</strong>
              <span className="text-white/70">
                {" · "}
                {formatDateRange(event.startsAt, event.endsAt, event.timezone)}
                {event.city ? ` · ${event.city}` : ""}
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 transition group-hover:translate-x-1" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

const perks = [
  { icon: Zap, title: "Register in a couple of minutes", text: "Pick your event, fill in your details, pay online." },
  { icon: QrCode, title: "Your QR ticket, instantly", text: "Emailed as a PDF and ready to scan at the gate." },
  { icon: Ticket, title: "Every ticket in one place", text: "Open or download them again whenever you need." },
];

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="grid grow lg:min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative min-h-[38svh] overflow-hidden lg:min-h-0" aria-label={siteName}>
        <Suspense fallback={<div className="absolute inset-0 bg-card" />}>
          <Showcase />
        </Suspense>
        <Link href="/" className="display absolute top-6 left-6 z-10 text-3xl sm:left-10 lg:top-10 lg:left-14">
          {siteName}
        </Link>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10 lg:py-16">
        <Reveal className="w-full max-w-md">
          <p className="text-sm font-bold tracking-[0.25em] text-white/50 uppercase">Welcome</p>
          <h1 className="display mt-3 text-6xl sm:text-7xl">Sign in</h1>
          <Suspense
            fallback={
              <div className="mt-4 space-y-8">
                <Skeleton className="h-7 w-4/5" />
                <Skeleton className="h-13 w-full" />
              </div>
            }
          >
            <SignIn searchParams={searchParams} />
          </Suspense>

          <ul className="mt-10 space-y-5 border-t border-white/10 pt-8">
            {perks.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-card">
                  <p.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-sm text-white/60">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-xs leading-relaxed text-white/45">
            We use your Google name, email and profile photo to create your account and issue your
            tickets. Nothing is posted on your behalf.{" "}
            <Link href="/events" className="underline underline-offset-4 hover:text-white">
              Just browsing? See the events.
            </Link>
          </p>
        </Reveal>
      </section>
    </main>
  );
}
