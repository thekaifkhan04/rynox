import Link from "next/link";
import { notFound } from "next/navigation";
import { RegistrationForm } from "@/app/(site)/events/[slug]/register/registration-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/session";
import { getAvailability } from "@/server/availability";
import { getEventById } from "@/server/events";
import { ticketLabel } from "@/server/labels";

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export const metadata = { title: "Offline registration" };

export default async function OfflineRegistrationPage({
  params,
}: PageProps<"/admin/events/[id]/registrations/new">) {
  const { id } = await params;
  await requireAdmin();
  const event = await getEventById(id);
  if (!event) notFound();

  const availability = await getAvailability(event.id);
  const types = event.ticketTypes
    .filter((t) => t.active)
    .map((t) => ({
      id: t.id,
      name: ticketLabel(t, event.competitions),
      description: t.description,
      pricePaise: t.offlinePricePaise ?? t.pricePaise,
      left: availability.byType[t.id] ?? null,
    }));
  const firstAvailable = types.find((t) => t.left !== 0);
  const back = `/admin/events/${event.id}/registrations`;

  return (
    <div className="space-y-6" style={{ "--event-accent": event.accentColor } as React.CSSProperties}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Offline registration</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            For people who pay you in person, by cash or UPI at the desk. They are charged the
            offline price, the seat is taken from the same capacity, and their QR ticket is
            emailed to them.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={back}>Back to registrations</Link>
        </Button>
      </div>
      {event.status === "CANCELLED" || !firstAvailable ? (
        <Alert>
          <AlertTitle>
            {event.status === "CANCELLED" ? "This event is cancelled." : "There are no seats left."}
          </AlertTitle>
          <AlertDescription>No further registrations can be added.</AlertDescription>
        </Alert>
      ) : (
        <RegistrationForm
          event={{ id: event.id, maxTicketsPerOrder: 10 }}
          types={types}
          fields={event.formFields}
          defaultTypeId={firstAvailable.id}
          user={{ name: "", email: "" }}
          offline={{ doneHref: back }}
        />
      )}
    </div>
  );
}
