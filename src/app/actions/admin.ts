"use server";

import { and, asc, count, eq, max } from "drizzle-orm";
import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  competitionLevels,
  competitions,
  eventSections,
  events,
  levelResults,
  formFields,
  orders,
  refunds,
  sponsorTiers,
  sponsors,
  ticketTypes,
  tickets,
  user as userTable,
} from "@/db/schema";
import { rupeesToPaise } from "@/lib/money";
import { assertAdmin } from "@/lib/session";
import { isSectionType, SECTIONS } from "@/sections/registry";
import { slugify } from "@/server/codes";
import {
  AdminInputError,
  saveEvent,
  setEventStatus,
  setFeaturedEvent,
  type EventInput,
} from "@/server/event-admin";
import { sendOrderEmail } from "@/server/emails";
import {
  checkIn,
  createOrder,
  OrderError,
  undoCheckIn,
  type CheckInResult,
  type CreateOrderInput,
} from "@/server/orders";
import { createApiToken, revokeApiToken } from "@/server/mcp/tokens";
import { processRefunds } from "@/server/payments";
import { recordLevelResult, undoLastLevelResult } from "@/server/progress";
import { cancelAndRefund } from "@/server/refunds";
import { parseSpreadsheetId, SheetsError, syncEventToSheet } from "@/server/sheets";
import { setSponsorStatus } from "@/server/sponsors";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Wraps an admin mutation: checks the role, reports errors as values, refreshes the page. */
async function admin<T extends object>(
  run: (adminId: string) => Promise<T | void>,
  // `refresh: false` skips re-rendering the page afterwards, for actions whose caller updates itself.
  opts: { refresh?: boolean } = {},
): Promise<Result<T>> {
  let adminId: string;
  try {
    adminId = (await assertAdmin()).id;
  } catch {
    return { ok: false, error: "You are not authorised to do that." };
  }
  try {
    const data = await run(adminId);
    if (opts.refresh !== false) refresh();
    return { ok: true, ...((data ?? {}) as T) };
  } catch (err) {
    if (err instanceof OrderError || err instanceof z.ZodError) {
      const message = err instanceof z.ZodError ? err.issues[0]?.message : err.message;
      return { ok: false, error: message ?? "Invalid input" };
    }
    if (err instanceof UserError || err instanceof AdminInputError || err instanceof SheetsError) {
      return { ok: false, error: err.message };
    }
    console.error("Admin action failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

class UserError extends Error {}

// ---------- Events ----------

const optional = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

export async function saveEventAction(id: string | null, input: EventInput) {
  return admin(() => saveEvent(id, input));
}

export async function setEventStatusAction(
  id: string,
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "CANCELLED",
) {
  return admin(() => setEventStatus(id, status));
}

/** Feature an event on the home page, or pass null to stop featuring any. */
export async function setFeaturedEventAction(id: string | null) {
  return admin(() => setFeaturedEvent(id));
}

export async function deleteEventAction(id: string) {
  return admin(async () => {
    const [{ n }] = await db.select({ n: count() }).from(orders).where(eq(orders.eventId, id));
    if (n > 0) {
      throw new UserError("This event has registrations and cannot be deleted. Cancel or close it instead.");
    }
    await db.delete(events).where(eq(events.id, id));
  });
}

// ---------- Ticket types ----------

const ticketTypeSchema = z.object({
  name: z.string().trim().min(1, "Name the ticket type").max(80),
  description: optional(300),
  competitionId: z.string(),
  price: z.string().trim(),
  offlinePrice: z.string().trim(),
  quota: z.string().trim(),
  active: z.boolean(),
});

export async function saveTicketTypeAction(
  eventId: string,
  id: string | null,
  input: z.input<typeof ticketTypeSchema>,
) {
  return admin(async () => {
    const v = ticketTypeSchema.parse(input);
    const pricePaise = rupeesToPaise(v.price === "" ? "0" : v.price);
    if (pricePaise == null) throw new UserError("Enter a valid price");
    // Razorpay's minimum order amount is ₹1.
    if (pricePaise > 0 && pricePaise < 100) throw new UserError("Paid tickets must cost at least ₹1");
    const offlinePricePaise = v.offlinePrice === "" ? null : rupeesToPaise(v.offlinePrice);
    if (v.offlinePrice !== "" && offlinePricePaise == null) {
      throw new UserError("Enter a valid offline price, or leave it empty");
    }
    const quota = v.quota === "" ? null : Number(v.quota);
    if (quota != null && (!Number.isInteger(quota) || quota < 0)) {
      throw new UserError("Seats must be a whole number, or empty for no limit");
    }
    let competitionId: string | null = null;
    if (v.competitionId) {
      const [c] = await db
        .select({ id: competitions.id })
        .from(competitions)
        .where(and(eq(competitions.id, v.competitionId), eq(competitions.eventId, eventId)));
      if (!c) throw new UserError("That competition does not belong to this event");
      competitionId = c.id;
    }
    const values = {
      name: v.name,
      description: v.description,
      competitionId,
      pricePaise,
      offlinePricePaise,
      quota,
      active: v.active,
    };
    if (id) {
      await db
        .update(ticketTypes)
        .set(values)
        .where(and(eq(ticketTypes.id, id), eq(ticketTypes.eventId, eventId)));
    } else {
      const [{ last }] = await db
        .select({ last: max(ticketTypes.sortOrder) })
        .from(ticketTypes)
        .where(eq(ticketTypes.eventId, eventId));
      await db.insert(ticketTypes).values({ eventId, sortOrder: (last ?? -1) + 1, ...values });
    }
  });
}

export async function deleteTicketTypeAction(eventId: string, id: string) {
  return admin(async () => {
    const [{ n }] = await db.select({ n: count() }).from(tickets).where(eq(tickets.ticketTypeId, id));
    if (n > 0) {
      throw new UserError("Tickets have been issued for this type. Switch it off instead of deleting it.");
    }
    await db.delete(ticketTypes).where(and(eq(ticketTypes.id, id), eq(ticketTypes.eventId, eventId)));
  });
}

// ---------- Competitions and levels ----------

const namedSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(100),
  description: optional(400),
});

export async function saveCompetitionAction(
  eventId: string,
  id: string | null,
  input: z.input<typeof namedSchema>,
) {
  return admin(async () => {
    const v = namedSchema.parse(input);
    if (id) {
      await db
        .update(competitions)
        .set(v)
        .where(and(eq(competitions.id, id), eq(competitions.eventId, eventId)));
      return;
    }
    const [{ last }] = await db
      .select({ last: max(competitions.sortOrder) })
      .from(competitions)
      .where(eq(competitions.eventId, eventId));
    await db.insert(competitions).values({ eventId, sortOrder: (last ?? -1) + 1, ...v });
  });
}

export async function deleteCompetitionAction(eventId: string, id: string) {
  return admin(async () => {
    const [{ n }] = await db
      .select({ n: count() })
      .from(tickets)
      .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
      .where(eq(ticketTypes.competitionId, id));
    if (n > 0) {
      throw new UserError("People have registered for this competition, so it cannot be deleted.");
    }
    await db.delete(competitions).where(and(eq(competitions.id, id), eq(competitions.eventId, eventId)));
  });
}

export async function moveCompetitionAction(eventId: string, id: string, direction: "up" | "down") {
  return admin(async () => {
    const rows = await db
      .select()
      .from(competitions)
      .where(eq(competitions.eventId, eventId))
      .orderBy(asc(competitions.sortOrder), asc(competitions.createdAt));
    await move(rows, id, direction, (cid, sortOrder) =>
      db.update(competitions).set({ sortOrder }).where(eq(competitions.id, cid)),
    );
  });
}

/** Makes sure the competition belongs to the event before its levels are touched. */
async function ownedCompetition(eventId: string, competitionId: string) {
  const [c] = await db
    .select()
    .from(competitions)
    .where(and(eq(competitions.id, competitionId), eq(competitions.eventId, eventId)));
  if (!c) throw new UserError("Competition not found");
  return c;
}

export async function saveLevelAction(
  eventId: string,
  competitionId: string,
  id: string | null,
  input: z.input<typeof namedSchema>,
) {
  return admin(async () => {
    await ownedCompetition(eventId, competitionId);
    const v = namedSchema.parse(input);
    if (id) {
      await db
        .update(competitionLevels)
        .set(v)
        .where(and(eq(competitionLevels.id, id), eq(competitionLevels.competitionId, competitionId)));
      return;
    }
    const [{ last }] = await db
      .select({ last: max(competitionLevels.sortOrder) })
      .from(competitionLevels)
      .where(eq(competitionLevels.competitionId, competitionId));
    await db.insert(competitionLevels).values({ competitionId, sortOrder: (last ?? -1) + 1, ...v });
  });
}

/** Levels with recorded results keep their place: reordering or removing them would rewrite history. */
async function assertNoResults(competitionId: string, what: string) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(levelResults)
    .innerJoin(competitionLevels, eq(levelResults.levelId, competitionLevels.id))
    .where(eq(competitionLevels.competitionId, competitionId));
  if (n > 0) throw new UserError(`Results have been recorded in this competition, so levels cannot be ${what}.`);
}

export async function deleteLevelAction(eventId: string, competitionId: string, id: string) {
  return admin(async () => {
    await ownedCompetition(eventId, competitionId);
    await assertNoResults(competitionId, "removed");
    await db
      .delete(competitionLevels)
      .where(and(eq(competitionLevels.id, id), eq(competitionLevels.competitionId, competitionId)));
  });
}

export async function moveLevelAction(
  eventId: string,
  competitionId: string,
  id: string,
  direction: "up" | "down",
) {
  return admin(async () => {
    await ownedCompetition(eventId, competitionId);
    await assertNoResults(competitionId, "reordered");
    const rows = await db
      .select()
      .from(competitionLevels)
      .where(eq(competitionLevels.competitionId, competitionId))
      .orderBy(asc(competitionLevels.sortOrder));
    await move(rows, id, direction, (lid, sortOrder) =>
      db.update(competitionLevels).set({ sortOrder }).where(eq(competitionLevels.id, lid)),
    );
  });
}

export async function recordLevelResultAction(input: {
  ticketId: string;
  levelId: string;
  outcome: "QUALIFIED" | "ELIMINATED";
  result: string;
}) {
  return admin(async (adminId) => {
    await recordLevelResult({ ...input, adminId });
  });
}

export async function undoLevelResultAction(ticketId: string) {
  return admin(async () => {
    await undoLastLevelResult(ticketId);
  });
}

// ---------- Registration form fields ----------

const fieldSchema = z.object({
  label: z.string().trim().min(1, "Enter the question").max(200),
  type: z.enum(["TEXT", "TEXTAREA", "NUMBER", "SELECT", "CHECKBOX"]),
  options: z.array(z.string().trim().min(1).max(100)).max(50),
  required: z.boolean(),
});

export async function saveFormFieldAction(
  eventId: string,
  id: string | null,
  input: z.input<typeof fieldSchema>,
) {
  return admin(async () => {
    const v = fieldSchema.parse(input);
    if (v.type === "SELECT" && v.options.length < 2) {
      throw new UserError("A dropdown needs at least two options");
    }
    const options = v.type === "SELECT" ? [...new Set(v.options)] : [];
    if (id) {
      // The key stays fixed so earlier answers keep matching their question.
      await db
        .update(formFields)
        .set({ label: v.label, type: v.type, options, required: v.required })
        .where(and(eq(formFields.id, id), eq(formFields.eventId, eventId)));
      return;
    }
    const existing = await db.select().from(formFields).where(eq(formFields.eventId, eventId));
    const base = slugify(v.label).replace(/-/g, "_").slice(0, 40) || "field";
    let key = base;
    for (let i = 2; existing.some((f) => f.key === key); i++) key = `${base}_${i}`;
    const sortOrder = Math.max(-1, ...existing.map((f) => f.sortOrder)) + 1;
    await db
      .insert(formFields)
      .values({ eventId, key, label: v.label, type: v.type, options, required: v.required, sortOrder });
  });
}

export async function deleteFormFieldAction(eventId: string, id: string) {
  return admin(async () => {
    await db.delete(formFields).where(and(eq(formFields.id, id), eq(formFields.eventId, eventId)));
  });
}

/** Swap an item with its neighbour, then renumber so sort orders stay dense. */
async function move<T extends { id: string }>(
  rows: T[],
  id: string,
  direction: "up" | "down",
  write: (id: string, sortOrder: number) => Promise<unknown>,
) {
  const i = rows.findIndex((r) => r.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  await Promise.all(rows.map((r, index) => write(r.id, index)));
}

export async function moveFormFieldAction(eventId: string, id: string, direction: "up" | "down") {
  return admin(async () => {
    const rows = await db
      .select()
      .from(formFields)
      .where(eq(formFields.eventId, eventId))
      .orderBy(asc(formFields.sortOrder));
    await move(rows, id, direction, (fid, sortOrder) =>
      db.update(formFields).set({ sortOrder }).where(eq(formFields.id, fid)),
    );
  });
}

export async function moveTicketTypeAction(eventId: string, id: string, direction: "up" | "down") {
  return admin(async () => {
    const rows = await db
      .select()
      .from(ticketTypes)
      .where(eq(ticketTypes.eventId, eventId))
      .orderBy(asc(ticketTypes.sortOrder), asc(ticketTypes.createdAt));
    await move(rows, id, direction, (tid, sortOrder) =>
      db.update(ticketTypes).set({ sortOrder }).where(eq(ticketTypes.id, tid)),
    );
  });
}

// ---------- Landing page sections ----------

export async function addSectionAction(eventId: string, type: string) {
  return admin(async () => {
    if (!isSectionType(type)) throw new UserError("Unknown section type");
    const [{ last }] = await db
      .select({ last: max(eventSections.sortOrder) })
      .from(eventSections)
      .where(eq(eventSections.eventId, eventId));
    const [section] = await db
      .insert(eventSections)
      .values({
        eventId,
        type,
        sortOrder: (last ?? -1) + 1,
        content: SECTIONS[type].schema.parse(SECTIONS[type].defaults) as Record<string, unknown>,
      })
      .returning({ id: eventSections.id });
    return { id: section.id };
  });
}

export async function saveSectionAction(eventId: string, id: string, content: unknown) {
  return admin(async () => {
    const [section] = await db
      .select()
      .from(eventSections)
      .where(and(eq(eventSections.id, id), eq(eventSections.eventId, eventId)));
    if (!section || !isSectionType(section.type)) throw new UserError("Section not found");
    const parsed = SECTIONS[section.type].schema.parse(content) as Record<string, unknown>;
    await db.update(eventSections).set({ content: parsed }).where(eq(eventSections.id, id));
  });
}

export async function setSectionVisibleAction(eventId: string, id: string, visible: boolean) {
  return admin(async () => {
    await db
      .update(eventSections)
      .set({ visible })
      .where(and(eq(eventSections.id, id), eq(eventSections.eventId, eventId)));
  });
}

export async function moveSectionAction(eventId: string, id: string, direction: "up" | "down") {
  return admin(async () => {
    const rows = await db
      .select()
      .from(eventSections)
      .where(eq(eventSections.eventId, eventId))
      .orderBy(asc(eventSections.sortOrder));
    await move(rows, id, direction, (sid, sortOrder) =>
      db.update(eventSections).set({ sortOrder }).where(eq(eventSections.id, sid)),
    );
  });
}

export async function deleteSectionAction(eventId: string, id: string) {
  return admin(async () => {
    await db
      .delete(eventSections)
      .where(and(eq(eventSections.id, id), eq(eventSections.eventId, eventId)));
  });
}

// ---------- Registrations ----------

/** Register people who paid in person. Tickets are issued and emailed straight away. */
export async function offlineRegisterAction(input: CreateOrderInput) {
  return admin(async (adminId) => {
    const order = await createOrder({ id: adminId }, input, new Date(), { offline: true });
    after(() => sendOrderEmail(order.id).catch((e) => console.error("Ticket email failed", e)));
    return { orderId: order.id };
  });
}

export async function resendTicketsAction(orderId: string) {
  return admin(async () => {
    try {
      await sendOrderEmail(orderId);
    } catch (err) {
      throw new UserError(err instanceof Error ? `Email not sent: ${err.message}` : "Email not sent");
    }
  });
}

export async function cancelTicketsAction(orderId: string, ticketIds: string[], reason: string) {
  return admin(async () => {
    const result = await cancelAndRefund(orderId, ticketIds, reason);
    const failed = result.refundIds.length
      ? await db
          .select({ id: refunds.id })
          .from(refunds)
          .where(and(eq(refunds.orderId, orderId), eq(refunds.status, "FAILED")))
      : [];
    return { amountPaise: result.amountPaise, refundFailed: failed.length > 0 };
  });
}

export async function retryRefundAction(refundId: string) {
  return admin(async () => {
    await processRefunds([refundId]);
    const [r] = await db.select().from(refunds).where(eq(refunds.id, refundId));
    if (r?.status === "FAILED") {
      throw new UserError("Razorpay rejected the refund again. Check the payment in the Razorpay dashboard.");
    }
  });
}

// ---------- Sponsorship ----------

const tierSchema = z.object({
  name: z.string().trim().min(1, "Name the level").max(80),
  benefits: optional(2000),
  price: z.string().trim(),
  slots: z.string().trim(),
  showInHero: z.boolean(),
  active: z.boolean(),
});

export async function saveSponsorTierAction(
  eventId: string,
  id: string | null,
  input: z.input<typeof tierSchema>,
) {
  return admin(async () => {
    const v = tierSchema.parse(input);
    const pricePaise = v.price === "" ? null : rupeesToPaise(v.price);
    if (v.price !== "" && pricePaise == null) {
      throw new UserError("Enter a valid amount, or leave it empty for “price on request”");
    }
    const slots = v.slots === "" ? null : Number(v.slots);
    if (slots != null && (!Number.isInteger(slots) || slots < 1)) {
      throw new UserError("Places must be a whole number, or empty for no limit");
    }
    const values = {
      name: v.name,
      benefits: v.benefits,
      pricePaise,
      slots,
      showInHero: v.showInHero,
      active: v.active,
    };
    if (id) {
      await db
        .update(sponsorTiers)
        .set(values)
        .where(and(eq(sponsorTiers.id, id), eq(sponsorTiers.eventId, eventId)));
      return;
    }
    const [{ last }] = await db
      .select({ last: max(sponsorTiers.sortOrder) })
      .from(sponsorTiers)
      .where(eq(sponsorTiers.eventId, eventId));
    await db.insert(sponsorTiers).values({ eventId, sortOrder: (last ?? -1) + 1, ...values });
  });
}

export async function deleteSponsorTierAction(eventId: string, id: string) {
  return admin(async () => {
    const [{ n }] = await db.select({ n: count() }).from(sponsors).where(eq(sponsors.tierId, id));
    if (n > 0) {
      throw new UserError("This level has sponsors or requests. Move or delete them first, or switch the level off.");
    }
    await db.delete(sponsorTiers).where(and(eq(sponsorTiers.id, id), eq(sponsorTiers.eventId, eventId)));
  });
}

export async function moveSponsorTierAction(eventId: string, id: string, direction: "up" | "down") {
  return admin(async () => {
    const rows = await db
      .select()
      .from(sponsorTiers)
      .where(eq(sponsorTiers.eventId, eventId))
      .orderBy(asc(sponsorTiers.sortOrder), asc(sponsorTiers.createdAt));
    await move(rows, id, direction, (tid, sortOrder) =>
      db.update(sponsorTiers).set({ sortOrder }).where(eq(sponsorTiers.id, tid)),
    );
  });
}

export async function setSponsorStatusAction(
  sponsorId: string,
  status: "PENDING" | "APPROVED" | "REJECTED",
) {
  return admin(async () => {
    await setSponsorStatus(sponsorId, status);
  });
}

const link = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Links must start with http:// or https://")
  .transform((v) => v || null);

const sponsorSchema = z.object({
  tierId: z.string().min(1, "Choose a level"),
  companyName: z.string().trim().min(2, "Enter the sponsor's name").max(120),
  website: link,
  logoUrl: link,
  paid: z.boolean(),
});

/** Edit a sponsor, or with `id` null add one directly (already approved). */
export async function saveSponsorAction(
  eventId: string,
  id: string | null,
  input: z.input<typeof sponsorSchema>,
) {
  return admin(async (adminId) => {
    const v = sponsorSchema.parse(input);
    const [tier] = await db
      .select()
      .from(sponsorTiers)
      .where(and(eq(sponsorTiers.id, v.tierId), eq(sponsorTiers.eventId, eventId)));
    if (!tier) throw new UserError("That level does not belong to this event");
    if (id) {
      await db.update(sponsors).set(v).where(and(eq(sponsors.id, id), eq(sponsors.eventId, eventId)));
      return;
    }
    const [me] = await db.select().from(userTable).where(eq(userTable.id, adminId));
    const [created] = await db
      .insert(sponsors)
      .values({
        ...v,
        eventId,
        contactName: me?.name ?? "Organiser",
        email: me?.email ?? "",
        phone: "",
        status: "PENDING",
      })
      .returning({ id: sponsors.id });
    // Goes through the same check as any approval, so a full level stays full.
    await setSponsorStatus(created.id, "APPROVED").catch(async (err) => {
      await db.delete(sponsors).where(eq(sponsors.id, created.id));
      throw err;
    });
  });
}

export async function deleteSponsorAction(eventId: string, id: string) {
  return admin(async () => {
    await db.delete(sponsors).where(and(eq(sponsors.id, id), eq(sponsors.eventId, eventId)));
  });
}

// ---------- Google Sheets ----------

/** Link (or, with an empty value, unlink) the Google Sheet an event syncs to. */
export async function saveSheetAction(eventId: string, link: string) {
  return admin(async () => {
    const value = link.trim();
    const sheetId = value ? parseSpreadsheetId(value) : null;
    if (value && !sheetId) {
      throw new UserError("That does not look like a Google Sheets link. Paste the address from your browser.");
    }
    await db.update(events).set({ sheetId, sheetSyncedAt: null }).where(eq(events.id, eventId));
  });
}

export async function syncSheetAction(eventId: string) {
  return admin(async () => {
    const { rows } = await syncEventToSheet(eventId);
    return { rows };
  });
}

// ---------- Check-in ----------

export type CheckInResponse = CheckInResult & {
  ticket?: { code: string; name: string; type: string };
};

async function checkInWithDetails(eventId: string, value: string, adminId: string): Promise<CheckInResponse> {
  const result = await checkIn(eventId, value, adminId);
  if (result.result === "not_found") return result;
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, result.ticketId),
    with: { ticketType: true },
  });
  return {
    ...result,
    ticket: ticket
      ? { code: ticket.ticketCode, name: ticket.attendeeName, type: ticket.ticketType.name }
      : undefined,
  };
}

export async function checkInAction(eventId: string, value: string): Promise<Result<{ data: CheckInResponse }>> {
  return admin(async (adminId) => ({ data: await checkInWithDetails(eventId, value, adminId) }));
}

/**
 * The scanner's version of check-in. It does not re-render the page after each
 * scan (the scanner keeps its own count), which keeps scans fast when the gate
 * is busy and several organisers are scanning at once.
 */
export async function scanTicketAction(eventId: string, value: string): Promise<Result<{ data: CheckInResponse }>> {
  return admin(async (adminId) => ({ data: await checkInWithDetails(eventId, value, adminId) }), { refresh: false });
}

export async function undoCheckInAction(ticketId: string) {
  return admin(async () => {
    await undoCheckIn(ticketId);
  });
}

// ---------- AI access (MCP) ----------

/** Creates an access token for an AI assistant. The token is returned once only. */
export async function createApiTokenAction(name: string) {
  return admin(async (adminId) => {
    const { token } = await createApiToken(adminId, name);
    return { token };
  });
}

export async function revokeApiTokenAction(id: string) {
  return admin(async (adminId) => {
    await revokeApiToken(adminId, id);
  });
}

// ---------- Users ----------

export async function setUserRoleAction(userId: string, role: "USER" | "ADMIN") {
  return admin(async (adminId) => {
    if (userId === adminId && role === "USER") {
      throw new UserError("You cannot remove your own admin access");
    }
    await db.update(userTable).set({ role }).where(eq(userTable.id, userId));
  });
}
