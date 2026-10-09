import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDateRange } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { getAvailability, registrationState } from "@/server/availability";
import { getEventBySlug } from "@/server/events";
import { ticketLabel } from "@/server/labels";
import { RegistrationForm } from "./registration-form";

export const metadata = { title: "Register" };

type Props = PageProps<"/events/[slug]/register">;

async function Register({ params, searchParams }: Props) {
  const { slug } = await params;
  const user = await requireUser(`/events/${slug}/register`);
  const event = await getEventBySlug(slug);
  if (!event || (event.status === "DRAFT" && !user.isAdmin)) notFound();

  const availability = await getAvailability(event.id);
  const registration = registrationState(event);
  const types = event.ticketTypes
    .filter((t) => t.active)
    .map((t) => ({
      id: t.id,
      name: ticketLabel(t, event.competitions),
      description: t.description,
      pricePaise: t.pricePaise,
      left: availability.byType[t.id] ?? null,
    }));
  const available = types.filter((t) => t.left !== 0);
  const requested = (await searchParams).type;
  const defaultType = available.find((t) => t.id === requested) ?? available[0];

  return (
    <div style={{ "--event-accent": event.accentColor } as React.CSSProperties}>
      <Button asChild variant="link" className="h-auto p-0 text-white/60 hover:text-white">
        <Link href={`/events/${event.slug}`}>← Back to event</Link>
      </Button>
      <h1 className="display mt-3 text-5xl sm:text-6xl">{event.title}</h1>
      <p className="mt-3 mb-10 text-white/70">
        {formatDateRange(event.startsAt, event.endsAt, event.timezone)} ·{" "}
        {[event.venueName, event.city].filter(Boolean).join(", ")}
      </p>
      {!registration.open ? (
        <Alert className="p-6">
          <AlertTitle className="text-lg">{registration.reason}</AlertTitle>
        </Alert>
      ) : !defaultType ? (
        <Alert className="p-6">
          <AlertTitle className="text-lg">This event is sold out.</AlertTitle>
        </Alert>
      ) : (
        <RegistrationForm
          event={{ id: event.id, maxTicketsPerOrder: event.maxTicketsPerOrder }}
          types={types}
          fields={event.formFields}
          defaultTypeId={defaultType.id}
          user={{ name: user.name, email: user.email }}
        />
      )}
    </div>
  );
}

export default function RegisterPage(props: Props) {
  return (
    <>
      <SiteHeader />
      <main className="container-page grow py-10">
        <Suspense fallback={<div className="h-96" />}>
          <Register {...props} />
        </Suspense>
      </main>
    </>
  );
}
