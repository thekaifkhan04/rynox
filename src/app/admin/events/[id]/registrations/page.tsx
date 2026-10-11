import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronsUpDown, Download, Plus } from "lucide-react";
import { RegistrationActions, RetryRefundButton } from "@/components/admin/registration-actions";
import { SheetSync } from "@/components/admin/sheet-sync";
import { StatusPill, ticketStatus } from "@/components/ticket-card";
import { SimpleSelect } from "@/components/simple-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { env, sheetsConfigured } from "@/lib/env";
import { formatAmount, formatPaise } from "@/lib/money";
import { requireAdmin } from "@/lib/session";
import {
  emptyStats,
  failedRefunds,
  listRegistrations,
  statsByEvent,
  type RegistrationFilters,
} from "@/server/admin-queries";
import { getEventById } from "@/server/events";

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export const metadata = { title: "Registrations" };

const PAGE_SIZE = 50;
/** First value of a query parameter; the selects send "all" for "no filter". */
const one = (v: string | string[] | undefined) => {
  const value = (Array.isArray(v) ? v[0] : v) ?? "";
  return value === "all" ? "" : value;
};

export default async function RegistrationsPage({
  params,
  searchParams,
}: PageProps<"/admin/events/[id]/registrations">) {
  const { id } = await params;
  await requireAdmin();
  const event = await getEventById(id);
  if (!event) notFound();

  const sp = await searchParams;
  const filters: RegistrationFilters = {
    q: one(sp.q),
    type: one(sp.type),
    status: one(sp.status),
    checkin: one(sp.checkin),
  };
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const [{ rows, total }, statsMap, failed] = await Promise.all([
    listRegistrations(event.id, filters, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    statsByEvent([event.id]),
    failedRefunds(event.id),
  ]);
  const stats = statsMap.get(event.id) ?? emptyStats;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v) as [string, string][],
  );
  const pageHref = (p: number) => {
    const q = new URLSearchParams(query);
    if (p > 1) q.set("page", String(p));
    return `?${q}`;
  };
  const labels = new Map(event.formFields.map((f) => [f.key, f.label]));

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Net revenue", formatAmount(stats.revenuePaise)],
          ["Tickets sold", `${stats.sold}${event.capacity != null ? ` / ${event.capacity}` : ""}`],
          ["Checked in", String(stats.checkedIn)],
          ["Refunded", formatAmount(stats.refundedPaise)],
        ].map(([label, value]) => (
          <Card key={label} size="sm">
            <CardHeader>
              <CardTitle className="text-xs font-normal text-muted-foreground">
                <dt>{label}</dt>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dd className="text-2xl font-bold tabular-nums">{value}</dd>
            </CardContent>
          </Card>
        ))}
      </dl>

      {failed.length > 0 && (
        <Alert variant="destructive" className="border-red-400/40 bg-red-400/10">
          <AlertTitle>
            {failed.length} refund{failed.length > 1 ? "s" : ""} could not be sent to Razorpay
          </AlertTitle>
          <AlertDescription>
          <ul className="space-y-2 text-sm">
            {failed.map(({ refund, orderNumber }) => (
              <li key={refund.id} className="flex flex-wrap items-center gap-3">
                <span>
                  Order {orderNumber} · {formatAmount(refund.amountPaise)}
                </span>
                <RetryRefundButton refundId={refund.id} />
              </li>
            ))}
          </ul>
          </AlertDescription>
        </Alert>
      )}

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="grow space-y-1.5 sm:max-w-xs">
          <Label htmlFor="q" className="text-xs text-muted-foreground">
            Search
          </Label>
          <Input id="q" name="q" type="search" defaultValue={filters.q} placeholder="Name, email, phone, ticket or order" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="type" className="text-xs text-muted-foreground">
            Ticket type
          </Label>
          <SimpleSelect
            id="type"
            name="type"
            className="w-44"
            defaultValue={filters.type || "all"}
            options={[
              { value: "all", label: "All types" },
              ...event.ticketTypes.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="status" className="text-xs text-muted-foreground">
            Payment
          </Label>
          <SimpleSelect
            id="status"
            name="status"
            className="w-48"
            defaultValue={filters.status || "all"}
            options={[
              { value: "all", label: "Paid and cancelled" },
              { value: "valid", label: "Paid" },
              { value: "cancelled", label: "Cancelled / refunded" },
              { value: "unpaid", label: "Unpaid (abandoned)" },
            ]}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="checkin" className="text-xs text-muted-foreground">
            Check-in
          </Label>
          <SimpleSelect
            id="checkin"
            name="checkin"
            className="w-36"
            defaultValue={filters.checkin || "all"}
            options={[
              { value: "all", label: "Any" },
              { value: "yes", label: "Checked in" },
              { value: "no", label: "Not yet" },
            ]}
          />
        </div>
        <Button type="submit">Apply</Button>
        {query.size > 0 && (
          <Button asChild variant="ghost">
            <Link href="?">Clear</Link>
          </Button>
        )}
        <Button asChild className="ml-auto">
          <Link href={`/admin/events/${event.id}/registrations/new`}>
            <Plus /> Offline registration
          </Link>
        </Button>
        <Button asChild variant="outline">
          <a href={`/api/admin/events/${event.id}/export?${query}`}>
            <Download /> Export CSV
          </a>
        </Button>
      </form>

      {rows.length === 0 ? (
        <Card className="border border-dashed border-white/15 bg-transparent ring-0">
          <CardContent className="py-6 text-center text-muted-foreground">
            {query.size > 0 ? "No registrations match these filters." : "No registrations yet."}
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Attendee</TableHead>
                <TableHead>Ticket</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const t = r.ticket;
                const answers = Object.entries(t.answers).filter(([, v]) => v !== "" && v !== false);
                return (
                  <TableRow key={t.id} className="align-top">
                    <TableCell className="py-3 whitespace-normal">
                      <p className="font-semibold">{t.attendeeName}</p>
                      <p className="text-white/65">{t.attendeeEmail}</p>
                      <p className="text-white/65">
                        {t.attendeePhone}
                        {t.organization ? ` · ${t.organization}` : ""}
                      </p>
                      {answers.length > 0 && (
                        <Collapsible className="mt-1">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="xs" className="-ml-2 text-white/60">
                              <ChevronsUpDown /> {answers.length} answer{answers.length > 1 ? "s" : ""}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                          <dl className="mt-1.5 space-y-1 text-xs">
                            {answers.map(([key, value]) => (
                              <div key={key}>
                                <dt className="inline text-white/50">{labels.get(key) ?? key}: </dt>
                                <dd className="inline">{value === true ? "Yes" : String(value)}</dd>
                              </div>
                            ))}
                          </dl>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      <p>{r.typeName}</p>
                      <p className="font-mono text-xs text-white/65">{t.ticketCode}</p>
                    </TableCell>
                    <TableCell className="py-3">
                      <StatusPill {...ticketStatus({ ...t, checkedInAt: null })} />
                      <p className="mt-1 text-white/65">
                        {formatPaise(t.pricePaise)}
                        {r.paymentMethod === "OFFLINE" && (
                          <Badge variant="outline" className="ml-2">
                            Offline
                          </Badge>
                        )}
                      </p>
                      <p className="font-mono text-xs text-white/50">{r.orderNumber}</p>
                    </TableCell>
                    <TableCell className="py-3">
                      {t.checkedInAt ? (
                        <span className="text-emerald-300">{formatDateTime(t.checkedInAt, event.timezone)}</span>
                      ) : (
                        <span className="text-white/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <RegistrationActions
                        eventId={event.id}
                        ticket={{
                          id: t.id,
                          orderId: t.orderId,
                          code: t.ticketCode,
                          name: t.attendeeName,
                          status: t.status,
                          checkedIn: t.checkedInAt != null,
                          pricePaise: t.pricePaise,
                          offline: r.paymentMethod === "OFFLINE",
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <SheetSync
        key={`${event.sheetId}-${event.sheetSyncedAt?.getTime()}`}
        eventId={event.id}
        configured={sheetsConfigured}
        serviceEmail={env.sheetsClientEmail}
        sheetId={event.sheetId}
        syncedAt={event.sheetSyncedAt ? formatDateTime(event.sheetSyncedAt, event.timezone) : null}
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} registration{total === 1 ? "" : "s"}
        </span>
        {pages > 1 && (
          <nav aria-label="Pages" className="flex items-center gap-3">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(page - 1)}>Previous</Link>
              </Button>
            )}
            <span>
              Page {page} of {pages}
            </span>
            {page < pages && (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(page + 1)}>Next</Link>
              </Button>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
