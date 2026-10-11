import Link from "next/link";
import { SetupStatus } from "@/components/admin/setup-status";
import { EventStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { checkConfig } from "@/lib/config-check";
import { formatDate } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { requireAdmin } from "@/lib/session";
import { listEventsWithStats } from "@/server/admin-queries";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export default async function AdminDashboard() {
  await requireAdmin();
  const rows = await listEventsWithStats();
  const total = rows.reduce(
    (a, r) => ({
      revenue: a.revenue + r.stats.revenuePaise,
      sold: a.sold + r.stats.sold,
      checkedIn: a.checkedIn + r.stats.checkedIn,
      refunded: a.refunded + r.stats.refundedPaise,
    }),
    { revenue: 0, sold: 0, checkedIn: 0, refunded: 0 },
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button asChild size="lg" className="px-4">
          <Link href="/admin/events/new">New event</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Net revenue" value={formatAmount(total.revenue)} hint="Valid tickets, after refunds" />
        <Stat label="Tickets sold" value={String(total.sold)} />
        <Stat
          label="Checked in"
          value={String(total.checkedIn)}
          hint={total.sold ? `${Math.round((total.checkedIn / total.sold) * 100)}% of tickets` : undefined}
        />
        <Stat label="Refunded" value={formatAmount(total.refunded)} />
      </div>

      <SetupStatus checks={checkConfig()} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Events</h2>
        {rows.length === 0 ? (
          <Card className="border border-dashed border-white/15 bg-transparent ring-0">
            <CardContent className="py-4 text-center text-muted-foreground">
              No events yet. Create your first one to start taking registrations.
            </CardContent>
          </Card>
        ) : (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Checked in</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ event, stats }) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <Button asChild variant="link" className="h-auto p-0 font-semibold">
                        <Link href={`/admin/events/${event.id}/registrations`}>{event.title}</Link>
                      </Button>
                    </TableCell>
                    <TableCell className="text-white/70">
                      {formatDate(event.startsAt, event.timezone)}
                    </TableCell>
                    <TableCell>
                      <EventStatusBadge status={event.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {stats.sold}
                      {event.capacity != null && <span className="text-white/50"> / {event.capacity}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{stats.checkedIn}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatAmount(stats.revenuePaise)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
