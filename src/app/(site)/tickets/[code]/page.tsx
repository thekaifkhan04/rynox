import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { TicketCard } from "@/components/ticket-card";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { progressLabel, progressOf } from "@/server/progress";
import { getTicketFor } from "@/server/ticket-access";
import { qrSvg } from "@/server/ticket-assets";

export const metadata = { title: "Ticket" };

async function TicketView({ params }: Pick<PageProps<"/tickets/[code]">, "params">) {
  const { code } = await params;
  const user = await requireUser(`/tickets/${code}`);
  const ticket = await getTicketFor(user, code);
  if (!ticket || ticket.status === "RESERVED") notFound();

  // A cancelled ticket shows no scannable code.
  const svg = ticket.status === "VALID" ? await qrSvg(ticket.qrToken) : null;

  const competition = ticket.ticketType.competition;
  const progress = progressOf(competition?.levels ?? [], ticket.levelResults);
  const label = progressLabel(progress);
  const stage =
    ticket.status === "VALID" && label && progress.state !== "none"
      ? {
          label,
          tone: progress.state === "eliminated" ? ("bad" as const) : progress.state === "completed" ? ("ok" as const) : ("warn" as const),
          detail:
            progress.state === "active"
              ? progress.index === 0
                ? "Your first level"
                : "You qualified for this level"
              : (ticket.levelResults.find((r) => r.levelId === progress.level.id)?.result ?? undefined),
        }
      : null;

  return (
    <div className="mx-auto max-w-3xl">
      <TicketCard
        ticket={ticket}
        ticketType={ticket.ticketType}
        event={ticket.event}
        qrSvg={svg}
        siteName={env.siteName}
        stage={stage}
      />
      <div className="mt-6 flex flex-wrap gap-3 print:hidden">
        {ticket.status === "VALID" && (
          <Button asChild size="xl">
            <a href={`/tickets/${ticket.ticketCode}/pdf`}>
              <Download /> Download PDF
            </a>
          </Button>
        )}
        {(ticket.order.userId === user.id || user.isAdmin) && (
          <Button asChild variant="outline" size="xl" className="font-semibold">
            <Link href={`/orders/${ticket.orderId}`}>View order</Link>
          </Button>
        )}
        <Button asChild variant="outline" size="xl" className="font-semibold">
          <Link href={`/events/${ticket.event.slug}`}>Event page</Link>
        </Button>
      </div>
    </div>
  );
}

export default function TicketPage({ params }: PageProps<"/tickets/[code]">) {
  return (
    <>
      <SiteHeader />
      <main className="container-page grow py-10">
        <Suspense fallback={<div className="h-96" />}>
          <TicketView params={params} />
        </Suspense>
      </main>
    </>
  );
}
