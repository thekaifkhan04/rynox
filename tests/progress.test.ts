import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { competitionLevels, competitions, ticketTypes, tickets } from "@/db/schema";
import { cancelTickets, createOrder, fulfillOrder } from "@/server/orders";
import {
  listEntrants,
  progressLabel,
  progressOf,
  recordLevelResult,
  undoLastLevelResult,
} from "@/server/progress";
import { attendee, makeEvent, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

/** An event with one competition of three levels and one paid entrant. */
async function setup(levelNames = ["Heats", "Semi-final", "Final"]) {
  const { event, types } = await makeEvent();
  const [competition] = await db
    .insert(competitions)
    .values({ eventId: event.id, name: "Sprint" })
    .returning();
  const levels = levelNames.length
    ? await db
        .insert(competitionLevels)
        .values(levelNames.map((name, sortOrder) => ({ competitionId: competition.id, name, sortOrder })))
        .returning()
    : [];
  await db.update(ticketTypes).set({ competitionId: competition.id }).where(eq(ticketTypes.id, types[0].id));
  const admin = await makeUser();
  const order = await createOrder(await makeUser(), { eventId: event.id, attendees: [attendee(types[0].id)] });
  await fulfillOrder(order.id, `pay_${order.id}`);
  const [ticket] = await db.select().from(tickets).where(eq(tickets.orderId, order.id));
  const state = async () => {
    const [entrant] = await listEntrants(competition.id);
    return progressOf(levels, entrant.levelResults);
  };
  const decide = (level: number, outcome: "QUALIFIED" | "ELIMINATED", result?: string) =>
    recordLevelResult({ ticketId: ticket.id, levelId: levels[level].id, outcome, result, adminId: admin.id });
  return { event, competition, levels, ticket, order, state, decide };
}

describe("level progress", () => {
  it("starts at the first level and moves up one level per qualification", async () => {
    const { state, decide } = await setup();
    expect(progressLabel(await state())).toBe("Level 1 of 3 · Heats");

    await decide(0, "QUALIFIED", "11.2s");
    expect(progressLabel(await state())).toBe("Level 2 of 3 · Semi-final");

    await decide(1, "QUALIFIED");
    await decide(2, "QUALIFIED");
    const done = await state();
    expect(done.state).toBe("completed");
    expect(progressLabel(done)).toBe("Completed all 3 levels");
    await expect(decide(2, "QUALIFIED")).rejects.toThrow(/completed every level/);
  });

  it("does not let anyone skip a level or be decided twice", async () => {
    const { decide } = await setup();
    await expect(decide(1, "QUALIFIED")).rejects.toThrow(/is at "Heats"/);
    await expect(decide(2, "QUALIFIED")).rejects.toThrow(/is at "Heats"/);
    await decide(0, "QUALIFIED");
    await expect(decide(0, "ELIMINATED")).rejects.toThrow(/is at "Semi-final"/);
  });

  it("stops at the level where the entrant goes out, and undo puts them back", async () => {
    const { ticket, state, decide } = await setup();
    await decide(0, "QUALIFIED");
    await decide(1, "ELIMINATED", "4th");
    const out = await state();
    expect(out.state).toBe("eliminated");
    expect(progressLabel(out)).toBe("Out at Semi-final");
    await expect(decide(2, "QUALIFIED")).rejects.toThrow(/already out/);

    await undoLastLevelResult(ticket.id);
    expect(progressLabel(await state())).toBe("Level 2 of 3 · Semi-final");
    await undoLastLevelResult(ticket.id);
    expect(progressLabel(await state())).toBe("Level 1 of 3 · Heats");
    await expect(undoLastLevelResult(ticket.id)).rejects.toThrow(/no result to undo/);
  });

  it("treats a competition without levels as a straight contest", async () => {
    const { state, ticket, competition } = await setup([]);
    expect((await state()).state).toBe("none");
    expect(progressLabel(await state())).toBeNull();
    const [level] = await db
      .insert(competitionLevels)
      .values({ competitionId: competition.id, name: "Race" })
      .returning();
    expect(progressLabel(progressOf([level], []))).toBe("Race");
    await expect(
      recordLevelResult({ ticketId: ticket.id, levelId: "nope", outcome: "QUALIFIED", adminId: ticket.id }),
    ).rejects.toThrow(/is at "Race"/);
  });

  it("only lists and decides valid tickets", async () => {
    const { ticket, order, competition, decide } = await setup();
    await cancelTickets(order.id, [ticket.id]);
    expect(await listEntrants(competition.id)).toHaveLength(0);
    await expect(decide(0, "QUALIFIED")).rejects.toThrow(/Only valid tickets/);
  });
});
