import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { SiteHeader } from "@/components/site-header";
import { StatusPill, ticketStatus } from "@/components/ticket-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { formatDateRange } from "@/lib/dates";
import { env, mockPayments } from "@/lib/env";
import { formatAmount, formatPaise } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { PayButton } from "./pay-button";

export const metadata = { title: "Your order" };

async function OrderView({ params }: Pick<PageProps<"/orders/[id]">, "params">) {
  const { id } = await params;
  const user = await requireUser(`/orders/${id}`);
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: { event: true, tickets: { with: { ticketType: true } }, refunds: true },
  });
  if (!order || (order.userId !== user.id && !user.isAdmin)) notFound();

  const { event } = order;
  const expired = order.status === "EXPIRED" || (order.status === "PENDING" && order.expiresAt < new Date());
  const payable = order.status === "PENDING" && !expired && order.userId === user.id;
  const paid = order.status === "PAID" || order.status === "PARTIALLY_REFUNDED";

  const heading = paid
    ? "You're in."
    : payable
      ? "Complete your payment"
      : order.status === "REFUNDED"
        ? "Order refunded"
        : order.status === "FAILED"
          ? "Payment failed"
          : "Reservation expired";

  return (
    <div style={{ "--event-accent": event.accentColor } as React.CSSProperties}>
      <p className="text-sm text-white/60">Order {order.orderNumber}</p>
      <h1 className="display mt-2 text-5xl sm:text-6xl">{heading}</h1>
      <p className="mt-3 text-white/70">
        {event.title} · {formatDateRange(event.startsAt, event.endsAt, event.timezone)}
      </p>

      {paid && (
        <p className="mt-6 max-w-2xl text-lg text-white/85">
          Your registration is confirmed and your ticket has been emailed to{" "}
          <strong>{order.buyerEmail}</strong>. You can also open it below at any time.
        </p>
      )}
      {!paid && !payable && (
        <div className="mt-6 max-w-2xl space-y-4">
          <p className="text-lg text-white/85">
            {order.status === "REFUNDED"
              ? "This order was cancelled and any payment has been refunded to the original payment method."
              : "The seats for this order were released because payment was not completed in time. If money was deducted, it is confirmed or refunded automatically."}
          </p>
          {order.status !== "REFUNDED" && (
            <Button asChild size="xl">
              <Link href={`/events/${event.slug}/register`}>Register again</Link>
            </Button>
          )}
        </div>
      )}

      <Card className="mt-8 max-w-2xl gap-0 rounded-none py-0">
        <CardContent className="p-0">
        <ul className="divide-y divide-white/10">
          {order.tickets.map((t) => {
            const status = ticketStatus(t);
            return (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                <div>
                  <p className="font-bold">{t.attendeeName}</p>
                  <p className="text-sm text-white/65">
                    {t.ticketType.name} · {formatPaise(t.pricePaise)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {(paid || t.status === "CANCELLED") && <StatusPill {...status} />}
                  {t.status === "VALID" && (
                    <Button asChild variant="accent" size="lg" className="px-4">
                      <Link href={`/tickets/${t.ticketCode}`}>View ticket</Link>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        </CardContent>
        <CardFooter className="justify-between border-t border-white/15 p-4 text-lg font-bold sm:p-5">
          <span>Total</span>
          <span>{formatAmount(order.amountPaise)}</span>
        </CardFooter>
      </Card>

      {payable && (
        <div className="mt-8">
          {mockPayments && (
            <Alert className="mb-4 max-w-2xl border-dashed border-amber-400/50 text-amber-200">
              <AlertDescription className="text-amber-200">
                Razorpay keys are not configured, so this button simulates a successful payment
                (development only).
              </AlertDescription>
            </Alert>
          )}
          <PayButton
            orderId={order.id}
            amountPaise={order.amountPaise}
            expiresAt={order.expiresAt.toISOString()}
            eventTitle={event.title}
            siteName={env.siteName}
            accent={event.accentColor}
            buyer={{ name: order.buyerName, email: order.buyerEmail, phone: order.buyerPhone }}
          />
        </div>
      )}
    </div>
  );
}

export default function OrderPage({ params }: PageProps<"/orders/[id]">) {
  return (
    <>
      <SiteHeader />
      <main className="container-page grow py-10">
        <Suspense fallback={<div className="h-96" />}>
          <OrderView params={params} />
        </Suspense>
      </main>
    </>
  );
}
