import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  competitionLevels,
  levelResults,
  ticketTypes,
  tickets,
  type CompetitionLevel,
  type LevelResult,
} from "@/db/schema";
import { OrderError } from "./orders";

export type Progress =
  /** The competition has no levels to move through. */
  | { state: "none" }
  /** Still to compete at `level` (number `index + 1` of `total`). */
  | { state: "active"; level: CompetitionLevel; index: number; total: number }
  | { state: "eliminated"; level: CompetitionLevel; index: number; total: number }
  /** Qualified from every level, including the last. */
  | { state: "completed"; level: CompetitionLevel; index: number; total: number };

/**
 * Where an entrant stands. Levels are passed strictly in order: the first
 * level without a QUALIFIED result is the one they are at.
 */
export function progressOf(
  levels: CompetitionLevel[],
  results: Pick<LevelResult, "levelId" | "outcome">[],
): Progress {
  const ordered = [...levels].sort((a, b) => a.sortOrder - b.sortOrder);
  if (ordered.length === 0) return { state: "none" };
  const byLevel = new Map(results.map((r) => [r.levelId, r.outcome]));
  const total = ordered.length;
  for (const [index, level] of ordered.entries()) {
    const outcome = byLevel.get(level.id);
    if (outcome === "ELIMINATED") return { state: "eliminated", level, index, total };
    if (outcome !== "QUALIFIED") return { state: "active", level, index, total };
  }
  return { state: "completed", level: ordered[total - 1], index: total - 1, total };
}

/** Short text for tickets and tables, e.g. "Level 2 of 3 · Semi-final". */
export function progressLabel(p: Progress): string | null {
  if (p.state === "none") return null;
  // A single level is just "the contest": only its outcome is worth showing.
  const where = p.total > 1 ? `Level ${p.index + 1} of ${p.total} · ${p.level.name}` : p.level.name;
  if (p.state === "active") return where;
  if (p.state === "eliminated") return `Out at ${p.level.name}`;
  return p.total > 1 ? `Completed all ${p.total} levels` : `Completed · ${p.level.name}`;
}

async function loadTicket(ticketId: string) {
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    with: { ticketType: true, levelResults: true },
  });
  if (!ticket) throw new OrderError("Ticket not found");
  const levels = ticket.ticketType.competitionId
    ? await db
        .select()
        .from(competitionLevels)
        .where(eq(competitionLevels.competitionId, ticket.ticketType.competitionId))
        .orderBy(asc(competitionLevels.sortOrder))
    : [];
  return { ticket, levels };
}

/**
 * Record that an entrant qualified from, or went out at, a level. Only the
 * level they are currently at can be decided, so nobody skips a level.
 */
export async function recordLevelResult(input: {
  ticketId: string;
  levelId: string;
  outcome: "QUALIFIED" | "ELIMINATED";
  result?: string;
  adminId: string;
}) {
  const { ticket, levels } = await loadTicket(input.ticketId);
  if (ticket.status !== "VALID") throw new OrderError("Only valid tickets can be given a result");
  const progress = progressOf(levels, ticket.levelResults);
  if (progress.state === "none") throw new OrderError("This entry's competition has no levels");
  if (progress.state === "eliminated") throw new OrderError("This entrant is already out");
  if (progress.state === "completed") throw new OrderError("This entrant has completed every level");
  if (progress.level.id !== input.levelId) {
    throw new OrderError(`This entrant is at "${progress.level.name}", not that level`);
  }
  const inserted = await db
    .insert(levelResults)
    .values({
      ticketId: ticket.id,
      levelId: input.levelId,
      outcome: input.outcome,
      result: input.result?.trim().slice(0, 120) || null,
      recordedById: input.adminId,
    })
    // Two organisers deciding the same entrant at once: the first one wins.
    .onConflictDoNothing()
    .returning({ id: levelResults.id });
  if (inserted.length === 0) throw new OrderError("A result was already recorded for this level");
}

/** Remove an entrant's most recent result, putting them back at that level. */
export async function undoLastLevelResult(ticketId: string) {
  const { ticket, levels } = await loadTicket(ticketId);
  const order = new Map(levels.map((l) => [l.id, l.sortOrder]));
  const last = [...ticket.levelResults].sort(
    (a, b) => (order.get(b.levelId) ?? -1) - (order.get(a.levelId) ?? -1),
  )[0];
  if (!last) throw new OrderError("There is no result to undo");
  await db.delete(levelResults).where(eq(levelResults.id, last.id));
}

/** Every valid entry in a competition with its results, oldest first. */
export async function listEntrants(competitionId: string) {
  const types = await db
    .select({ id: ticketTypes.id })
    .from(ticketTypes)
    .where(eq(ticketTypes.competitionId, competitionId));
  if (types.length === 0) return [];
  return db.query.tickets.findMany({
    where: and(
      eq(tickets.status, "VALID"),
      inArray(
        tickets.ticketTypeId,
        types.map((t) => t.id),
      ),
    ),
    with: { ticketType: true, levelResults: true },
    orderBy: [asc(tickets.attendeeName)],
  });
}
