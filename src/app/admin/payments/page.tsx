import Link from "next/link";
import { asc } from "drizzle-orm";
import { Download, ExternalLink } from "lucide-react";
import { SimpleSelect } from "@/components/simple-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { db } from "@/db";
import { events, type Order } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { requireAdmin } from "@/lib/session";
import { listPayments, paymentTotals, type PaymentFilters } from "@/server/payment-queries";

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export const metadata = { title: "Payments" };

const PAGE_SIZE = 50;

const one = (v: string | string[] | undefined) => {
  const value = (Array.isArray(v) ? v[0] : v) ?? "";
  return value === "any" ? "" : value;
};

const statusLook: Record<Order["status"], { label: string; className: string }> = {
  PAID: { label: "Paid", className: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" },
  PARTIALLY_REFUNDED: { label: "Part refunded", className: "border-amber-400/40 bg-amber-400/10 text-amber-300" },
  REFUNDED: { label: "Refunded", className: "border-red-400/40 bg-red-400/10 text-red-300" },
  PENDING: { label: "Not paid yet", className: "text-white/65" },
  EXPIRED: { label: "Expired unpaid", className: "text-white/50" },
  FAILED: { label: "Failed", className: "border-red-400/40 text-red-300" },
};

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  await requireAdmin();
  const sp = await searchParams;
  const filters: PaymentFilters = {
    q: one(sp.q),
    event: one(sp.event),
    status: one(sp.status) || "received",
    method: one(sp.method),
  };
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const [{ rows, total }, totals, allEvents] = await Promise.all([
    listPayments(filters, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    paymentTotals(filters),
    db.select({ id: events.id, title: events.title }).from(events).orderBy(asc(events.title)),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const query = new URLSearchParams(
    Object.entries(filters).filter(([k, v]) => v && !(k === "status" && v === "received")) as [string, string][],
  );
  const pageHref = (p: number) => {
    const q = new URLSearchParams(query);
    if (p > 1) q.set("page", String(p));
    return `?${q}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Every order across all events, with what was collected and what went back as refunds. The
          totals follow the filters below.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Collected", formatAmount(totals.collectedPaise), `${totals.payments} payment${totals.payments === 1 ? "" : "s"}`],
          ["Refunded", formatAmount(totals.refundedPaise), "Sent or on its way"],
          ["Net", formatAmount(totals.netPaise), "Collected minus refunded"],
          ["Online", formatAmount(totals.onlinePaise), "Through Razorpay"],
          ["Offline", formatAmount(totals.offlinePaise), "Collected in person"],
        ].map(([label, value, hint]) => (
          <Card key={label} size="sm">
            <CardHeader>
              <CardTitle className="text-xs font-normal text-muted-foreground">
                <dt>{label}</dt>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dd className="text-2xl font-bold tabular-nums">{value}</dd>
              <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
            </CardContent>
          </Card>
        ))}
      </dl>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="grow space-y-1.5 sm:max-w-xs">
          <Label htmlFor="q" className="text-xs text-muted-foreground">
            Search
          </Label>
          <Input id="q" name="q" type="search" defaultValue={filters.q} placeholder="Order, buyer, email or payment ID" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="event" className="text-xs text-muted-foreground">
            Event
          </Label>
          <SimpleSelect
            id="event"
            name="event"
            className="w-52"
            defaultValue={filters.event || "any"}
            options={[{ value: "any", label: "All events" }, ...allEvents.map((e) => ({ value: e.id, label: e.title }))]}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="status" className="text-xs text-muted-foreground">
            Show
          </Label>
          <SimpleSelect
            id="status"
            name="status"
            className="w-48"
            defaultValue={filters.status}
            options={[
              { value: "received", label: "Money received" },
              { value: "refunded", label: "With refunds" },
              { value: "unpaid", label: "Unpaid or failed" },
              { value: "all", label: "Every order" },
            ]}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="method" className="text-xs text-muted-foreground">
            Paid how
          </Label>
          <SimpleSelect
            id="method"
            name="method"
            className="w-36"
            defaultValue={filters.method || "any"}
            options={[
              { value: "any", label: "Any" },
              { value: "online", label: "Online" },
              { value: "offline", label: "Offline" },
            ]}
          />
        </div>
        <Button type="submit">Apply</Button>
        {query.size > 0 && (
          <Button asChild variant="ghost">
            <Link href="/admin/payments">Clear</Link>
          </Button>
        )}
        <Button asChild variant="outline" className="ml-auto">
          <a href={`/api/admin/payments/export?${query}`}>
            <Download /> Export CSV
          </a>
        </Button>
      </form>

      {rows.length === 0 ? (
        <Card className="border border-dashed border-white/15 bg-transparent ring-0">
          <CardContent className="py-6 text-center text-muted-foreground">
            {query.size > 0 ? "No payments match these filters." : "No payments yet."}
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Order</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Refunded</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead className="pr-4">Payment ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ order: o, eventTitle, timezone, refundedPaise, tickets }) => {
                const look = statusLook[o.status];
                // Offline and simulated payments carry an internal marker, not a Razorpay id.
                const gatewayId = o.razorpayPaymentId?.startsWith("pay_") ? o.razorpayPaymentId : null;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="pl-4">
                      <Button asChild variant="link" className="h-auto p-0 font-mono text-sm">
                        <Link href={`/orders/${o.id}`}>{o.orderNumber}</Link>
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        {tickets} ticket{tickets === 1 ? "" : "s"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{o.buyerName}</p>
                      <p className="text-xs text-muted-foreground">{o.buyerEmail}</p>
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="link" className="h-auto p-0 text-sm text-white/85">
                        <Link href={`/admin/events/${o.eventId}/registrations?q=${o.orderNumber}`}>{eventTitle}</Link>
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={look.className}>
                        {look.label}
                      </Badge>
                      {o.paymentMethod === "OFFLINE" && (
                        <Badge variant="outline" className="ml-1.5">
                          Offline
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatAmount(o.amountPaise)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-white/70">
                      {refundedPaise > 0 ? formatAmount(refundedPaise) : "—"}
                    </TableCell>
                    <TableCell className="text-white/75">
                      {o.paidAt ? formatDateTime(o.paidAt, timezone) : "—"}
                    </TableCell>
                    <TableCell className="pr-4">
                      {gatewayId ? (
                        <Button asChild variant="link" className="h-auto p-0 font-mono text-xs">
                          <a
                            href={`https://dashboard.razorpay.com/app/payments/${gatewayId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {gatewayId} <ExternalLink />
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {o.paymentMethod === "OFFLINE" ? "Paid in person" : o.razorpayPaymentId ? "Simulated" : "—"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} order{total === 1 ? "" : "s"}
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
