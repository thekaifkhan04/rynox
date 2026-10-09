import { Suspense } from "react";
import Link from "next/link";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { SiteHeader } from "@/components/site-header";
import { StatusPill, ticketStatus } from "@/components/ticket-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { orders, tickets } from "@/db/schema";
import { formatDateRange } from "@/lib/dates";
import { requireUser } from "@/lib/session";

export const metadata = { title: "My tickets" };

async function MyTickets() {
  const user = await requireUser("/tickets");
  const mine = await db.query.tickets.findMany({
    where: and(
      inArray(tickets.status, ["VALID", "CANCELLED"]),
      // Tickets this account bought, plus tickets issued to its email by someone else.
      or(
        inArray(
          tickets.orderId,
          db.select({ id: orders.id }).from(orders).where(eq(orders.userId, user.id)),
        ),
        eq(tickets.attendeeEmail, user.email.toLowerCase()),
      ),
    ),
    with: { event: true, ticketType: true },
    orderBy: [desc(tickets.createdAt)],
  });

  if (mine.length === 0) {
    return (
      <Card className="rounded-none bg-transparent text-center">
        <CardContent className="py-4">
          <p className="text-lg text-white/80">You don&apos;t have any tickets yet.</p>
          <Button asChild size="xl" className="mt-5">
            <Link href="/events">Browse events</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {mine.map((t) => (
        <li key={t.id}>
          <Link href={`/tickets/${t.ticketCode}`} className="block h-full">
            <Card
              className="h-full rounded-none transition hover:ring-white/40"
              style={{ borderLeft: `4px solid ${t.event.accentColor}` }}
            >
              <CardContent>
            <div className="flex items-start justify-between gap-3">
              <p className="display text-2xl">{t.event.title}</p>
              <StatusPill {...ticketStatus(t)} />
            </div>
            <p className="mt-2 text-sm text-white/65">
              {formatDateRange(t.event.startsAt, t.event.endsAt, t.event.timezone)} ·{" "}
              {[t.event.venueName, t.event.city].filter(Boolean).join(", ")}
            </p>
            <p className="mt-4 font-semibold">
              {t.attendeeName} <span className="font-normal text-white/60">· {t.ticketType.name}</span>
            </p>
            <p className="mt-1 font-mono text-sm text-white/60">{t.ticketCode}</p>
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function TicketsPage() {
  return (
    <>
      <SiteHeader />
      <main className="container-page grow py-10">
        <h1 className="display mb-8 text-5xl sm:text-6xl">My tickets</h1>
        <Suspense fallback={<div className="h-64" />}>
          <MyTickets />
        </Suspense>
      </main>
    </>
  );
}
