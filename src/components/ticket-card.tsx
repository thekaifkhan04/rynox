import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { Event, Ticket, TicketType } from "@/db/schema";
import { formatDateRange, formatDateTime, formatTime } from "@/lib/dates";

export function ticketStatus(ticket: Ticket): { label: string; tone: "ok" | "warn" | "bad" } {
  if (ticket.status === "CANCELLED") return { label: "Cancelled", tone: "bad" };
  if (ticket.status === "RESERVED") return { label: "Awaiting payment", tone: "warn" };
  if (ticket.checkedInAt) return { label: "Checked in", tone: "ok" };
  return { label: "Confirmed · Paid", tone: "ok" };
}

const tones = {
  ok: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  warn: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  bad: "border-red-400/40 bg-red-400/10 text-red-300",
};

export function StatusPill({ label, tone }: { label: string; tone: keyof typeof tones }) {
  return (
    <Badge variant="outline" className={tones[tone]}>
      {label}
    </Badge>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.7rem] tracking-[0.15em] text-white/50 uppercase">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

/** The on-screen ticket. `qrSvg` is generated server-side from the ticket's token. */
export function TicketCard({
  ticket,
  ticketType,
  event,
  qrSvg,
  siteName,
  stage,
}: {
  ticket: Ticket;
  ticketType: TicketType;
  event: Event;
  qrSvg: string | null;
  siteName: string;
  /** Where the entrant stands in a competition with levels, when there is one. */
  stage?: { label: string; tone: "ok" | "warn" | "bad"; detail?: string } | null;
}) {
  const status = ticketStatus(ticket);
  return (
    <Card className="gap-0 overflow-hidden rounded-2xl py-0">
      <header className="px-6 py-5 text-background" style={{ background: event.accentColor }}>
        <p className="text-xs font-bold tracking-[0.2em] uppercase">{siteName} · Entry ticket</p>
        <h2 className="display mt-1 text-4xl">{event.title}</h2>
      </header>
      <CardContent className="grid gap-6 p-6 sm:grid-cols-[1fr_auto]">
        <dl className="grid content-start gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-[0.7rem] tracking-[0.15em] text-white/50 uppercase">Athlete</dt>
            <dd className="mt-0.5 text-2xl font-bold">{ticket.attendeeName}</dd>
          </div>
          <Field label="Category">{ticketType.name}</Field>
          <Field label="Status">
            <StatusPill {...status} />
          </Field>
          <Field label="Date">{formatDateRange(event.startsAt, event.endsAt, event.timezone)}</Field>
          <Field label="Starts">{formatTime(event.startsAt, event.timezone)}</Field>
          <div className="sm:col-span-2">
            <Field label="Venue">
              {[event.venueName, event.venueAddress, event.city].filter(Boolean).join(", ")}
            </Field>
          </div>
          {stage && (
            <div className="sm:col-span-2">
              <Field label="Competition progress">
                <StatusPill label={stage.label} tone={stage.tone} />
                {stage.detail && <span className="ml-2 text-sm text-white/65">{stage.detail}</span>}
              </Field>
            </div>
          )}
          {ticket.checkedInAt && (
            <div className="sm:col-span-2">
              <Field label="Checked in">{formatDateTime(ticket.checkedInAt, event.timezone)}</Field>
            </div>
          )}
        </dl>
        <div className="flex flex-col items-center justify-center gap-3">
          {qrSvg ? (
            <div
              role="img"
              aria-label={`QR code for ticket ${ticket.ticketCode}`}
              className="size-48 rounded-xl bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <div className="flex size-48 items-center justify-center rounded-xl border border-dashed border-white/20 p-4 text-center text-sm text-white/50">
              QR code is not available for this ticket
            </div>
          )}
          <p className="font-mono text-lg font-bold tracking-wider">{ticket.ticketCode}</p>
        </div>
      </CardContent>
      <CardFooter className="border-t border-dashed border-white/15 px-6 py-4 text-sm text-white/55">
        Show this QR code at the entrance. Each ticket can be scanned once. Bring a photo ID.
      </CardFooter>
    </Card>
  );
}
