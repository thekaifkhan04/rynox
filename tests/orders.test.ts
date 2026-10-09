import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { orders, refunds, ticketTypes, tickets } from "@/db/schema";
import { getAvailability } from "@/server/availability";
import { cancelTickets, checkIn, createOrder, fulfillOrder, OrderError } from "@/server/orders";
import { addField, attendee, makeEvent, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

const ticketsOf = (orderId: string) => db.select().from(tickets).where(eq(tickets.orderId, orderId));
const orderOf = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];

describe("createOrder", () => {
  it("creates a pending order with reserved tickets and the right total", async () => {
    const { event, types } = await makeEvent({}, [
      { name: "Men", pricePaise: 80_000 },
      { name: "Women", pricePaise: 60_000 },
    ]);
    const u = await makeUser();
    const order = await createOrder(u, {
      eventId: event.id,
      attendees: [attendee(types[0].id, 1), attendee(types[1].id, 2)],
    });
    expect(order.status).toBe("PENDING");
    expect(order.amountPaise).toBe(140_000);
    const ts = await ticketsOf(order.id);
    expect(ts).toHaveLength(2);
    expect(ts.every((t) => t.status === "RESERVED")).toBe(true);
    expect(new Set(ts.map((t) => t.qrToken)).size).toBe(2);
  });

  it("confirms free orders immediately", async () => {
    const { event, types } = await makeEvent({}, [{ name: "Free", pricePaise: 0 }]);
    const order = await createOrder(await makeUser(), {
      eventId: event.id,
      attendees: [attendee(types[0].id)],
    });
    expect(order.status).toBe("PAID");
    expect((await ticketsOf(order.id))[0].status).toBe("VALID");
  });

  it("enforces the per-order ticket limit", async () => {
    const { event, types } = await makeEvent({ maxTicketsPerOrder: 1 });
    await expect(
      createOrder(await makeUser(), {
        eventId: event.id,
        attendees: [attendee(types[0].id, 1), attendee(types[0].id, 2)],
      }),
    ).rejects.toThrow(OrderError);
  });

  it("rejects drafts, closed registration and inactive ticket types", async () => {
    const u = await makeUser();
    const draft = await makeEvent({ status: "DRAFT" });
    await expect(
      createOrder(u, { eventId: draft.event.id, attendees: [attendee(draft.types[0].id)] }),
    ).rejects.toThrow(/not published/);

    const closed = await makeEvent({ registrationClosesAt: new Date(Date.now() - 1000) });
    await expect(
      createOrder(u, { eventId: closed.event.id, attendees: [attendee(closed.types[0].id)] }),
    ).rejects.toThrow(/closed/);

    const other = await makeEvent();
    const ev = await makeEvent();
    await expect(
      createOrder(u, { eventId: ev.event.id, attendees: [attendee(other.types[0].id)] }),
    ).rejects.toThrow(/not available/);
  });

  it("validates custom fields", async () => {
    const { event, types } = await makeEvent();
    await addField(event.id, { key: "size", label: "T-shirt size", type: "SELECT", options: ["S", "M"], required: true });
    await addField(event.id, { key: "waiver", label: "Waiver", type: "CHECKBOX", required: true });
    const u = await makeUser();
    await expect(
      createOrder(u, { eventId: event.id, attendees: [attendee(types[0].id, 1, { waiver: true })] }),
    ).rejects.toThrow(/T-shirt size/);
    await expect(
      createOrder(u, { eventId: event.id, attendees: [attendee(types[0].id, 1, { size: "XL", waiver: true })] }),
    ).rejects.toThrow(/invalid choice/);
    await expect(
      createOrder(u, { eventId: event.id, attendees: [attendee(types[0].id, 1, { size: "M" })] }),
    ).rejects.toThrow(/Waiver/);
    const order = await createOrder(u, {
      eventId: event.id,
      attendees: [attendee(types[0].id, 1, { size: "M", waiver: true, injected: "x" })],
    });
    expect((await ticketsOf(order.id))[0].answers).toEqual({ size: "M", waiver: true });
  });

  it("never oversells a ticket type under concurrency", async () => {
    const { event, types } = await makeEvent({}, [{ name: "Elite", pricePaise: 10_000, quota: 3 }]);
    const users = await Promise.all(Array.from({ length: 12 }, () => makeUser()));
    const results = await Promise.allSettled(
      users.map((u) => createOrder(u, { eventId: event.id, attendees: [attendee(types[0].id)] })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect((await getAvailability(event.id)).byType[types[0].id]).toBe(0);
  });

  it("never exceeds the event capacity across ticket types", async () => {
    const { event, types } = await makeEvent({ capacity: 4 }, [
      { name: "A", pricePaise: 10_000 },
      { name: "B", pricePaise: 10_000 },
    ]);
    const users = await Promise.all(Array.from({ length: 10 }, () => makeUser()));
    const results = await Promise.allSettled(
      users.map((u, i) =>
        createOrder(u, { eventId: event.id, attendees: [attendee(types[i % 2].id)] }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    expect((await getAvailability(event.id)).eventRemaining).toBe(0);
  });

  it("frees seats when a hold expires", async () => {
    const { event, types } = await makeEvent({}, [{ name: "Only", pricePaise: 10_000, quota: 1 }]);
    const past = new Date(Date.now() - 60 * 60_000);
    await createOrder(await makeUser(), { eventId: event.id, attendees: [attendee(types[0].id)] }, past);
    expect((await getAvailability(event.id)).byType[types[0].id]).toBe(1);
    const order = await createOrder(await makeUser(), {
      eventId: event.id,
      attendees: [attendee(types[0].id)],
    });
    expect(order.status).toBe("PENDING");
  });

  it("replaces the same user's earlier unpaid hold", async () => {
    const { event, types } = await makeEvent({}, [{ name: "Only", pricePaise: 10_000, quota: 1 }]);
    const u = await makeUser();
    const first = await createOrder(u, { eventId: event.id, attendees: [attendee(types[0].id)] });
    const second = await createOrder(u, { eventId: event.id, attendees: [attendee(types[0].id)] });
    expect((await orderOf(first.id)).status).toBe("EXPIRED");
    expect(second.status).toBe("PENDING");
  });
});

describe("offline registration", () => {
  it("confirms at the offline price, outside the registration window, within capacity", async () => {
    const { event } = await makeEvent(
      { registrationClosesAt: new Date(Date.now() - 1000), maxTicketsPerOrder: 1 },
      [],
    );
    const [type] = await db
      .insert(ticketTypes)
      .values({ eventId: event.id, name: "Men", pricePaise: 250_000, offlinePricePaise: 300_000, quota: 2 })
      .returning();
    const admin = await makeUser();

    const order = await createOrder(
      admin,
      { eventId: event.id, attendees: [attendee(type.id, 1), attendee(type.id, 2)] },
      new Date(),
      { offline: true },
    );
    expect(order.status).toBe("PAID");
    expect(order.paymentMethod).toBe("OFFLINE");
    expect(order.amountPaise).toBe(600_000);
    const ts = await ticketsOf(order.id);
    expect(ts.every((t) => t.status === "VALID" && t.pricePaise === 300_000)).toBe(true);

    await expect(
      createOrder(admin, { eventId: event.id, attendees: [attendee(type.id, 3)] }, new Date(), { offline: true }),
    ).rejects.toThrow(/sold out/);

    // Cancelling records a refund that is settled by hand, not through Razorpay.
    const res = await cancelTickets(order.id, [ts[0].id]);
    expect(res.paymentId).toBe(`offline_${order.orderNumber}`);
  });
});

describe("fulfillOrder", () => {
  it("marks the order paid and tickets valid, exactly once", async () => {
    const { event, types } = await makeEvent();
    const order = await createOrder(await makeUser(), {
      eventId: event.id,
      attendees: [attendee(types[0].id, 1), attendee(types[0].id, 2)],
    });
    const results = await Promise.all([
      fulfillOrder(order.id, "pay_1"),
      fulfillOrder(order.id, "pay_1"),
      fulfillOrder(order.id, "pay_1"),
    ]);
    expect(results.filter((r) => r.outcome === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "already_paid")).toHaveLength(2);
    const o = await orderOf(order.id);
    expect(o.status).toBe("PAID");
    expect(o.razorpayPaymentId).toBe("pay_1");
    expect((await ticketsOf(order.id)).every((t) => t.status === "VALID")).toBe(true);
  });

  it("returns not_found for unknown orders", async () => {
    expect((await fulfillOrder("nope", "pay_x")).outcome).toBe("not_found");
  });

  it("honours a late payment when the seat is still free", async () => {
    const { event, types } = await makeEvent({}, [{ name: "Only", pricePaise: 10_000, quota: 1 }]);
    const past = new Date(Date.now() - 60 * 60_000);
    const order = await createOrder(await makeUser(), { eventId: event.id, attendees: [attendee(types[0].id)] }, past);
    expect((await fulfillOrder(order.id, "pay_late")).outcome).toBe("fulfilled");
  });

  it("asks for a refund when a late payment finds the seat taken", async () => {
    const { event, types } = await makeEvent({}, [{ name: "Only", pricePaise: 10_000, quota: 1 }]);
    const past = new Date(Date.now() - 60 * 60_000);
    const late = await createOrder(await makeUser(), { eventId: event.id, attendees: [attendee(types[0].id)] }, past);
    const winner = await createOrder(await makeUser(), { eventId: event.id, attendees: [attendee(types[0].id)] });
    await fulfillOrder(winner.id, "pay_win");

    const res = await fulfillOrder(late.id, "pay_late");
    expect(res).toEqual({ outcome: "refund_required", amountPaise: 10_000 });
    expect((await orderOf(late.id)).status).toBe("REFUNDED");
    expect((await ticketsOf(late.id))[0].status).toBe("CANCELLED");
    expect((await getAvailability(event.id)).byType[types[0].id]).toBe(0);
  });
});

describe("cancelTickets", () => {
  it("cancels one ticket, records a refund and releases the seat", async () => {
    const { event, types } = await makeEvent({}, [{ name: "T", pricePaise: 25_000, quota: 2 }]);
    const order = await createOrder(await makeUser(), {
      eventId: event.id,
      attendees: [attendee(types[0].id, 1), attendee(types[0].id, 2)],
    });
    await fulfillOrder(order.id, "pay_1");
    const [t1, t2] = await ticketsOf(order.id);

    const res = await cancelTickets(order.id, [t1.id], "Injury");
    expect(res.amountPaise).toBe(25_000);
    expect(res.refundIds).toHaveLength(1);
    expect((await orderOf(order.id)).status).toBe("PARTIALLY_REFUNDED");
    expect((await getAvailability(event.id)).byType[types[0].id]).toBe(1);

    await cancelTickets(order.id, [t2.id]);
    expect((await orderOf(order.id)).status).toBe("REFUNDED");
    expect(await db.select().from(refunds).where(eq(refunds.orderId, order.id))).toHaveLength(2);
    await expect(cancelTickets(order.id, [t2.id])).rejects.toThrow(OrderError);
  });

  it("refuses unpaid orders", async () => {
    const { event, types } = await makeEvent();
    const order = await createOrder(await makeUser(), { eventId: event.id, attendees: [attendee(types[0].id)] });
    const [t] = await ticketsOf(order.id);
    await expect(cancelTickets(order.id, [t.id])).rejects.toThrow(/paid/);
  });
});

describe("checkIn", () => {
  async function paidTicket() {
    const { event, types } = await makeEvent();
    const order = await createOrder(await makeUser(), { eventId: event.id, attendees: [attendee(types[0].id)] });
    await fulfillOrder(order.id, `pay_${order.id}`);
    return { event, order, ticket: (await ticketsOf(order.id))[0], admin: await makeUser() };
  }

  it("checks in once, by token or code, even under concurrent scans", async () => {
    const { event, ticket, admin } = await paidTicket();
    const results = await Promise.all(
      [ticket.qrToken, ticket.qrToken, ticket.ticketCode.toLowerCase()].map((v) =>
        checkIn(event.id, v, admin.id),
      ),
    );
    expect(results.filter((r) => r.result === "checked_in")).toHaveLength(1);
    expect(results.filter((r) => r.result === "already_checked_in")).toHaveLength(2);
  });

  it("rejects unknown, wrong-event, unpaid and cancelled tickets", async () => {
    const { event, order, ticket, admin } = await paidTicket();
    expect((await checkIn(event.id, "garbage", admin.id)).result).toBe("not_found");

    const other = await makeEvent();
    expect((await checkIn(other.event.id, ticket.qrToken, admin.id)).result).toBe("wrong_event");

    const pending = await createOrder(await makeUser(), {
      eventId: other.event.id,
      attendees: [attendee(other.types[0].id)],
    });
    const [pt] = await ticketsOf(pending.id);
    expect((await checkIn(other.event.id, pt.qrToken, admin.id)).result).toBe("not_paid");

    await cancelTickets(order.id, [ticket.id]);
    expect((await checkIn(event.id, ticket.qrToken, admin.id)).result).toBe("cancelled");
  });
});
