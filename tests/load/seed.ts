// Builds the data for the gate load test in the separate load-test database.
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/index";
import { events, orders, ticketTypes, tickets, user } from "../../src/db/schema";
import { auth } from "../../src/lib/auth";
import { newOrderNumber, newQrToken, newTicketCode } from "../../src/server/codes";

const ATHLETES = Number(process.env.ATHLETES ?? 400); // real accounts that open their own ticket
const EXTRA_TICKETS = Number(process.env.EXTRA_TICKETS ?? 6000); // pool for the scanners to work through

async function signUp(email: string) {
  const res = await auth.api.signUpEmail({
    body: { email, password: "load-test-password", name: email.split("@")[0] },
    returnHeaders: true,
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const [u] = await db.select().from(user).where(eq(user.email, email));
  return { id: u.id, cookie };
}

async function main() {
  const day = 86_400_000;
  const [event] = await db
    .insert(events)
    .values({
      slug: "load-test-race", title: "Load Test Race", venueName: "Stadium", city: "Bhubaneswar",
      startsAt: new Date(Date.now() + day), endsAt: new Date(Date.now() + 2 * day), status: "PUBLISHED",
    })
    .returning();
  const [type] = await db.insert(ticketTypes).values({ eventId: event.id, name: "Runner", pricePaise: 50_000 }).returning();

  // The first account becomes the admin (the scanner).
  const admin = await signUp("gate-admin@load.test");

  const athletes: { cookie: string; code: string }[] = [];
  for (let i = 0; i < ATHLETES; i += 20) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(20, ATHLETES - i) }, (_, j) => signUp(`athlete${i + j}@load.test`)),
    );
    for (const [j, a] of batch.entries()) {
      const email = `athlete${i + j}@load.test`;
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: newOrderNumber(), eventId: event.id, userId: a.id, buyerName: email, buyerEmail: email,
          buyerPhone: "9876543210", amountPaise: 50_000, status: "PAID", paidAt: new Date(),
          expiresAt: new Date(), razorpayPaymentId: `load_${i + j}`,
        })
        .returning();
      const code = newTicketCode();
      await db.insert(tickets).values({
        orderId: order.id, eventId: event.id, ticketTypeId: type.id, ticketCode: code, qrToken: newQrToken(),
        attendeeName: `Athlete ${i + j}`, attendeeEmail: email, attendeePhone: "9876543210", pricePaise: 50_000, status: "VALID",
      });
      athletes.push({ cookie: a.cookie, code });
    }
  }

  // Tickets for the scanners: valid, unscanned.
  const [bulk] = await db
    .insert(orders)
    .values({
      orderNumber: newOrderNumber(), eventId: event.id, userId: admin.id, buyerName: "Bulk", buyerEmail: "bulk@load.test",
      buyerPhone: "9876543210", amountPaise: 0, status: "PAID", paidAt: new Date(), expiresAt: new Date(),
    })
    .returning();
  const tokens: string[] = [];
  for (let i = 0; i < EXTRA_TICKETS; i += 1000) {
    const rows = Array.from({ length: Math.min(1000, EXTRA_TICKETS - i) }, (_, j) => {
      const qrToken = newQrToken();
      tokens.push(qrToken);
      return {
        orderId: bulk.id, eventId: event.id, ticketTypeId: type.id, ticketCode: newTicketCode(), qrToken,
        attendeeName: `Runner ${i + j}`, attendeeEmail: `runner${i + j}@load.test`, attendeePhone: "9876543210",
        pricePaise: 50_000, status: "VALID" as const,
      };
    });
    await db.insert(tickets).values(rows);
  }

  writeFileSync(process.env.OUT!, JSON.stringify({ eventId: event.id, adminCookie: admin.cookie, athletes, tokens }));
  console.log(`seeded: ${athletes.length} athletes with tickets, ${tokens.length} tickets to scan`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit());
