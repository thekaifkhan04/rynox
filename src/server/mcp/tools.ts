import { and, asc, desc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  competitionLevels,
  competitions,
  eventSections,
  events,
  formFields,
  levelResults,
  sponsorTiers,
  ticketTypes,
} from "@/db/schema";
import { toLocalInput } from "@/lib/dates";
import { DEFAULT_SECTIONS, isSectionType, SECTION_TYPES, SECTIONS } from "@/sections/registry";
import { emptyStats, statsByEvent } from "../admin-queries";
import { slugify } from "../codes";
import { AdminInputError, saveEvent, setEventStatus } from "../event-admin";
import { getEventById } from "../events";

/**
 * The tools an AI assistant can call through the MCP endpoint. They cover
 * building and editing events. Nothing here deletes data, refunds money or
 * touches individual registrations: those stay in the admin dashboard.
 */

export type ToolContext = { adminId: string; appUrl: string };

type Tool<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  input: S;
  run: (args: z.output<S>, ctx: ToolContext) => Promise<unknown>;
};

const tool = <S extends z.ZodType>(t: Tool<S>) => t as unknown as Tool;

// ---------- shared pieces ----------

const eventRef = z.string().min(1).describe("The event's id or its slug (the last part of its page address).");
const localTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use the form 2026-12-20T06:00")
  .describe("Local date and time in the event's timezone, e.g. 2026-12-20T06:00");

async function resolveEvent(ref: string) {
  const [row] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, ref))
    .union(db.select({ id: events.id }).from(events).where(eq(events.slug, ref)));
  if (!row) throw new AdminInputError(`No event found for "${ref}". Use list_events to see what exists.`);
  const event = await getEventById(row.id);
  if (!event) throw new AdminInputError("Event not found");
  return event;
}

const links = (ctx: ToolContext, e: { id: string; slug: string }) => ({
  adminUrl: `${ctx.appUrl}/admin/events/${e.id}`,
  pageUrl: `${ctx.appUrl}/events/${e.slug}`,
});

function paise(rupees: number, what: string) {
  if (!Number.isFinite(rupees) || rupees < 0) throw new AdminInputError(`${what} must be zero or more`);
  const value = Math.round(rupees * 100);
  // Razorpay's minimum order amount is ₹1.
  if (value > 0 && value < 100) throw new AdminInputError(`${what} must be free or at least ₹1`);
  return value;
}

const ticketTypeSpec = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  price: z.number().describe("Online price in rupees. 0 = free."),
  offlinePrice: z.number().optional().describe("Price in rupees when registered in person. Omit if the same."),
  seats: z.number().int().min(0).optional().describe("Seat limit for this ticket type. Omit for no limit."),
  competition: z.string().trim().optional().describe("Name of the competition this ticket enters. Omit for general entry."),
  active: z.boolean().optional().describe("Whether it is on sale. Default true."),
});

const competitionSpec = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(400).optional(),
  levels: z
    .array(z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(400).optional() }))
    .max(20)
    .optional()
    .describe("Ordered levels. Entrants must qualify from each to reach the next. Omit, or give one, for a straight contest."),
});

const formFieldSpec = z.object({
  label: z.string().trim().min(1).max(200),
  type: z.enum(["TEXT", "TEXTAREA", "NUMBER", "SELECT", "CHECKBOX"]).default("TEXT"),
  options: z.array(z.string().trim().min(1).max(100)).max(50).optional().describe("Choices, for SELECT only."),
  required: z.boolean().optional(),
});

const sectionSpec = z.object({
  type: z.string().describe(`One of: ${SECTION_TYPES.join(", ")}. Call list_section_types for each one's content shape.`),
  content: z.record(z.string(), z.unknown()).describe("Content for this section type."),
  visible: z.boolean().optional(),
});

const sponsorLevelSpec = z.object({
  name: z.string().trim().min(1).max(80),
  benefits: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  amount: z.number().optional().describe("Amount in rupees. Omit for “price on request”."),
  places: z.number().int().min(1).optional().describe("How many sponsors this level takes. Omit for no limit."),
  showInHero: z.boolean().optional().describe("Whether sponsors at this level are named in the event's hero. Default true."),
});

async function upsertCompetition(eventId: string, spec: z.output<typeof competitionSpec>) {
  const existing = await db.select().from(competitions).where(eq(competitions.eventId, eventId));
  let competition = existing.find((c) => c.name.toLowerCase() === spec.name.toLowerCase());
  if (competition) {
    if (spec.description !== undefined) {
      await db.update(competitions).set({ description: spec.description || null }).where(eq(competitions.id, competition.id));
    }
  } else {
    [competition] = await db
      .insert(competitions)
      .values({
        eventId,
        name: spec.name,
        description: spec.description || null,
        sortOrder: Math.max(-1, ...existing.map((c) => c.sortOrder)) + 1,
      })
      .returning();
  }
  if (spec.levels) {
    const [recorded] = await db
      .select({ id: levelResults.id })
      .from(levelResults)
      .innerJoin(competitionLevels, eq(levelResults.levelId, competitionLevels.id))
      .where(eq(competitionLevels.competitionId, competition.id))
      .limit(1);
    if (recorded) {
      throw new AdminInputError(
        `Results have already been recorded in "${competition.name}", so its levels cannot be replaced. Edit them in the dashboard.`,
      );
    }
    await db.delete(competitionLevels).where(eq(competitionLevels.competitionId, competition.id));
    if (spec.levels.length) {
      await db.insert(competitionLevels).values(
        spec.levels.map((l, i) => ({
          competitionId: competition.id,
          name: l.name,
          description: l.description || null,
          sortOrder: i,
        })),
      );
    }
  }
  return competition;
}

async function upsertTicketType(eventId: string, spec: z.output<typeof ticketTypeSpec>) {
  const existing = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
  let competitionId: string | null | undefined;
  if (spec.competition !== undefined) {
    if (spec.competition === "") competitionId = null;
    else {
      const all = await db.select().from(competitions).where(eq(competitions.eventId, eventId));
      const found = all.find((c) => c.name.toLowerCase() === spec.competition!.toLowerCase());
      if (!found) {
        throw new AdminInputError(
          `There is no competition named "${spec.competition}" on this event. Create it first with upsert_competition.`,
        );
      }
      competitionId = found.id;
    }
  }
  const values = {
    name: spec.name,
    pricePaise: paise(spec.price, "Price"),
    ...(spec.description !== undefined ? { description: spec.description || null } : {}),
    ...(spec.offlinePrice !== undefined ? { offlinePricePaise: paise(spec.offlinePrice, "Offline price") } : {}),
    ...(spec.seats !== undefined ? { quota: spec.seats } : {}),
    ...(competitionId !== undefined ? { competitionId } : {}),
    ...(spec.active !== undefined ? { active: spec.active } : {}),
  };
  const current = existing.find((t) => t.name.toLowerCase() === spec.name.toLowerCase());
  if (current) {
    await db.update(ticketTypes).set(values).where(eq(ticketTypes.id, current.id));
    return "updated";
  }
  await db
    .insert(ticketTypes)
    .values({ eventId, sortOrder: Math.max(-1, ...existing.map((t) => t.sortOrder)) + 1, ...values });
  return "created";
}

async function addFormField(eventId: string, spec: z.output<typeof formFieldSpec>) {
  if (spec.type === "SELECT" && (spec.options?.length ?? 0) < 2) {
    throw new AdminInputError(`The dropdown "${spec.label}" needs at least two options`);
  }
  const existing = await db.select().from(formFields).where(eq(formFields.eventId, eventId));
  if (existing.some((f) => f.label.toLowerCase() === spec.label.toLowerCase())) {
    throw new AdminInputError(`The registration form already asks "${spec.label}"`);
  }
  const base = slugify(spec.label).replace(/-/g, "_").slice(0, 40) || "field";
  let key = base;
  for (let i = 2; existing.some((f) => f.key === key); i++) key = `${base}_${i}`;
  await db.insert(formFields).values({
    eventId,
    key,
    label: spec.label,
    type: spec.type,
    options: spec.type === "SELECT" ? [...new Set(spec.options)] : [],
    required: spec.required ?? false,
    sortOrder: Math.max(-1, ...existing.map((f) => f.sortOrder)) + 1,
  });
}

function parseSections(specs: z.output<typeof sectionSpec>[]) {
  return specs.map((s, i) => {
    if (!isSectionType(s.type)) {
      throw new AdminInputError(`Unknown section type "${s.type}". Valid types: ${SECTION_TYPES.join(", ")}.`);
    }
    const parsed = SECTIONS[s.type].schema.safeParse(s.content);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new AdminInputError(
        `Section ${i + 1} (${s.type}): ${issue?.path.join(".") || "content"} — ${issue?.message}. Call list_section_types for the expected shape.`,
      );
    }
    return {
      type: s.type,
      sortOrder: i,
      visible: s.visible ?? true,
      content: parsed.data as Record<string, unknown>,
    };
  });
}

async function addSponsorLevel(eventId: string, spec: z.output<typeof sponsorLevelSpec>) {
  const [{ last }] = await db
    .select({ last: max(sponsorTiers.sortOrder) })
    .from(sponsorTiers)
    .where(eq(sponsorTiers.eventId, eventId));
  await db.insert(sponsorTiers).values({
    eventId,
    name: spec.name,
    benefits: spec.benefits?.join("\n") || null,
    pricePaise: spec.amount == null ? null : paise(spec.amount, "Amount"),
    slots: spec.places ?? null,
    showInHero: spec.showInHero ?? true,
    sortOrder: (last ?? -1) + 1,
  });
}

const detailFields = {
  title: z.string().trim().min(2).max(120),
  slug: z.string().trim().max(80).optional().describe("Page address, e.g. iron-mile-2027. Built from the title when omitted."),
  tagline: z.string().trim().max(120).optional().describe("Short line above the title. Separate words with • to get a moving band of words on the page."),
  summary: z.string().trim().max(600).optional().describe("One or two sentences shown under the hero and in link previews."),
  coverImageUrl: z.string().trim().max(2000).optional().describe("Link to a wide photo for the top of the page."),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Hex colour for buttons and highlights, e.g. #dc1e2d."),
  venueName: z.string().trim().min(2).max(160),
  venueAddress: z.string().trim().max(300).optional(),
  city: z.string().trim().max(80).optional(),
  mapUrl: z.string().trim().max(2000).optional(),
  timezone: z.string().trim().optional().describe("IANA timezone. Default Asia/Kolkata."),
  startsAt: localTime,
  endsAt: localTime,
  registrationOpensAt: localTime.optional(),
  registrationClosesAt: localTime.optional(),
  capacity: z.number().int().min(1).optional().describe("Total seats across all ticket types. Omit for no overall limit."),
  maxTicketsPerOrder: z.number().int().min(1).max(20).optional().describe("How many tickets one person can buy at once. Default 1."),
};

// ---------- the tools ----------

export const TOOLS: Tool[] = [
  tool({
    name: "list_events",
    description: "List every event with its status, dates and links. Start here to find an event to work on.",
    input: z.object({}),
    run: async (_args, ctx) => {
      const rows = await db.select().from(events).orderBy(desc(events.startsAt));
      return rows.map((e) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        status: e.status,
        startsAt: toLocalInput(e.startsAt, e.timezone),
        endsAt: toLocalInput(e.endsAt, e.timezone),
        timezone: e.timezone,
        city: e.city,
        ...links(ctx, e),
      }));
    },
  }),

  tool({
    name: "get_event",
    description:
      "Everything about one event: details, ticket types, competitions and their levels, registration questions, landing page sections, sponsorship levels and headline numbers. Read this before changing an event.",
    input: z.object({ event: eventRef }),
    run: async ({ event: ref }, ctx) => {
      const e = await resolveEvent(ref);
      const tiers = await db
        .select()
        .from(sponsorTiers)
        .where(eq(sponsorTiers.eventId, e.id))
        .orderBy(asc(sponsorTiers.sortOrder));
      const stats = (await statsByEvent([e.id])).get(e.id) ?? emptyStats;
      const competitionName = (id: string | null) => e.competitions.find((c) => c.id === id)?.name ?? null;
      return {
        id: e.id,
        ...links(ctx, e),
        status: e.status,
        details: {
          title: e.title,
          slug: e.slug,
          tagline: e.tagline,
          summary: e.summary,
          coverImageUrl: e.coverImageUrl,
          accentColor: e.accentColor,
          venueName: e.venueName,
          venueAddress: e.venueAddress,
          city: e.city,
          mapUrl: e.mapUrl,
          timezone: e.timezone,
          startsAt: toLocalInput(e.startsAt, e.timezone),
          endsAt: toLocalInput(e.endsAt, e.timezone),
          registrationOpensAt: toLocalInput(e.registrationOpensAt, e.timezone) || null,
          registrationClosesAt: toLocalInput(e.registrationClosesAt, e.timezone) || null,
          capacity: e.capacity,
          maxTicketsPerOrder: e.maxTicketsPerOrder,
        },
        ticketTypes: e.ticketTypes.map((t) => ({
          name: t.name,
          description: t.description,
          price: t.pricePaise / 100,
          offlinePrice: t.offlinePricePaise == null ? null : t.offlinePricePaise / 100,
          seats: t.quota,
          competition: competitionName(t.competitionId),
          active: t.active,
        })),
        competitions: e.competitions.map((c) => ({
          name: c.name,
          description: c.description,
          levels: c.levels.map((l) => ({ name: l.name, description: l.description })),
        })),
        formFields: e.formFields.map((f) => ({
          label: f.label,
          type: f.type,
          options: f.options,
          required: f.required,
        })),
        sections: e.sections.map((s) => ({ type: s.type, visible: s.visible, content: s.content })),
        sponsorLevels: tiers.map((t) => ({
          name: t.name,
          benefits: (t.benefits ?? "").split("\n").filter(Boolean),
          amount: t.pricePaise == null ? null : t.pricePaise / 100,
          places: t.slots,
          showInHero: t.showInHero,
        })),
        numbers: {
          ticketsSold: stats.sold,
          checkedIn: stats.checkedIn,
          netRevenue: stats.revenuePaise / 100,
          refunded: stats.refundedPaise / 100,
        },
      };
    },
  }),

  tool({
    name: "list_section_types",
    description:
      "The kinds of section a landing page can have, with the exact content shape (JSON Schema) and an example for each. Call this before create_event or set_landing_page when you are writing sections.",
    input: z.object({}),
    run: async () =>
      SECTION_TYPES.map((type) => ({
        type,
        label: SECTIONS[type].label,
        description: SECTIONS[type].description,
        contentSchema: z.toJSONSchema(SECTIONS[type].schema, { io: "input" }),
        example: SECTIONS[type].defaults,
        notes:
          type === "tickets"
            ? "Shows the live ticket types with prices and seats left. Include it once."
            : type === "countdown"
              ? "Counts down to the event start."
              : undefined,
      })),
  }),

  tool({
    name: "create_event",
    description:
      "Create a complete event in one call: details, ticket types, competitions with levels, registration questions, landing page sections and sponsorship levels. The event is created as a DRAFT, so nothing is public until it is published. Anything you leave out can be added later. If `ticketTypes` is omitted a free “General entry” ticket is added; if `sections` is omitted a starter landing page is added. Only state facts the organiser gave you: do not invent prices, dates, prizes or what a ticket includes.",
    input: z.object({
      ...detailFields,
      competitions: z.array(competitionSpec).max(30).optional().describe(
        "One competition with several levels = a level-wise event. Several competitions = contests people enter separately. Each can have its own levels.",
      ),
      ticketTypes: z.array(ticketTypeSpec).max(50).optional(),
      formFields: z.array(formFieldSpec).max(40).optional().describe(
        "Extra questions asked of each attendee. Name, email, phone and college/company are always asked.",
      ),
      sections: z.array(sectionSpec).max(40).optional().describe("Landing page sections, in order, below the hero."),
      sponsorLevels: z.array(sponsorLevelSpec).max(20).optional(),
    }),
    run: async (args, ctx) => {
      // Check the sections before anything is written, so a bad one creates nothing.
      const sections = args.sections ? parseSections(args.sections) : null;
      const created = await saveEvent(
        null,
        {
          title: args.title,
          slug: args.slug ?? "",
          tagline: args.tagline ?? "",
          summary: args.summary ?? "",
          coverImageUrl: args.coverImageUrl ?? "",
          accentColor: args.accentColor ?? "#ff4d1c",
          venueName: args.venueName,
          venueAddress: args.venueAddress ?? "",
          city: args.city ?? "",
          mapUrl: args.mapUrl ?? "",
          timezone: args.timezone ?? "Asia/Kolkata",
          startsAt: args.startsAt,
          endsAt: args.endsAt,
          registrationOpensAt: args.registrationOpensAt ?? "",
          registrationClosesAt: args.registrationClosesAt ?? "",
          capacity: args.capacity == null ? "" : String(args.capacity),
          maxTicketsPerOrder: args.maxTicketsPerOrder ?? 1,
        },
        { starter: false },
      );
      try {
        for (const c of args.competitions ?? []) await upsertCompetition(created.id, c);
        const types = args.ticketTypes ?? [{ name: "General entry", price: 0 }];
        for (const t of types) await upsertTicketType(created.id, t);
        for (const f of args.formFields ?? []) await addFormField(created.id, f);
        const rows =
          sections ??
          DEFAULT_SECTIONS.map((type, i) => ({
            type,
            sortOrder: i,
            visible: true,
            content: SECTIONS[type].schema.parse(SECTIONS[type].defaults) as Record<string, unknown>,
          }));
        if (rows.length) await db.insert(eventSections).values(rows.map((r) => ({ eventId: created.id, ...r })));
        for (const s of args.sponsorLevels ?? []) await addSponsorLevel(created.id, s);
      } catch (err) {
        // Leave nothing half-built behind.
        await db.delete(events).where(eq(events.id, created.id));
        throw err;
      }
      return {
        created: true,
        id: created.id,
        slug: created.slug,
        status: "DRAFT",
        ...links(ctx, created),
        next: "The event is a draft. Ask the organiser to review it at adminUrl, then publish it with set_event_status.",
        usedStarterLandingPage: !sections,
      };
    },
  }),

  tool({
    name: "update_event",
    description: "Change an event's details. Only the fields you pass are changed.",
    input: z.object({ event: eventRef, ...Object.fromEntries(Object.entries(detailFields).map(([k, v]) => [k, v.optional()])) }),
    run: async (args, ctx) => {
      const a = args as { event: string } & Partial<z.output<z.ZodObject<typeof detailFields>>>;
      const e = await resolveEvent(a.event);
      const tz = a.timezone ?? e.timezone;
      const saved = await saveEvent(e.id, {
        title: a.title ?? e.title,
        slug: a.slug ?? e.slug,
        tagline: a.tagline ?? e.tagline ?? "",
        summary: a.summary ?? e.summary ?? "",
        coverImageUrl: a.coverImageUrl ?? e.coverImageUrl ?? "",
        accentColor: a.accentColor ?? e.accentColor,
        venueName: a.venueName ?? e.venueName,
        venueAddress: a.venueAddress ?? e.venueAddress ?? "",
        city: a.city ?? e.city ?? "",
        mapUrl: a.mapUrl ?? e.mapUrl ?? "",
        timezone: tz,
        startsAt: a.startsAt ?? toLocalInput(e.startsAt, tz),
        endsAt: a.endsAt ?? toLocalInput(e.endsAt, tz),
        registrationOpensAt: a.registrationOpensAt ?? toLocalInput(e.registrationOpensAt, tz),
        registrationClosesAt: a.registrationClosesAt ?? toLocalInput(e.registrationClosesAt, tz),
        capacity: a.capacity != null ? String(a.capacity) : e.capacity == null ? "" : String(e.capacity),
        maxTicketsPerOrder: a.maxTicketsPerOrder ?? e.maxTicketsPerOrder,
      });
      return { updated: true, ...saved, ...links(ctx, saved) };
    },
  }),

  tool({
    name: "upsert_competition",
    description:
      "Add a competition to an event, or update the one with the same name. Passing `levels` replaces its levels (not allowed once results have been recorded).",
    input: z.object({ event: eventRef, ...competitionSpec.shape }),
    run: async ({ event: ref, ...spec }) => {
      const e = await resolveEvent(ref);
      const c = await upsertCompetition(e.id, spec);
      return { saved: true, competition: c.name };
    },
  }),

  tool({
    name: "upsert_ticket_type",
    description:
      "Add a ticket type to an event, or update the one with the same name. Fields you leave out keep their current value. Changing a price does not affect tickets already sold.",
    input: z.object({ event: eventRef, ...ticketTypeSpec.shape }),
    run: async ({ event: ref, ...spec }) => {
      const e = await resolveEvent(ref);
      return { result: await upsertTicketType(e.id, spec), ticketType: spec.name };
    },
  }),

  tool({
    name: "add_form_field",
    description: "Add a question to an event's registration form. Every attendee answers it.",
    input: z.object({ event: eventRef, ...formFieldSpec.shape }),
    run: async ({ event: ref, ...spec }) => {
      const e = await resolveEvent(ref);
      await addFormField(e.id, spec);
      return { added: true, question: spec.label };
    },
  }),

  tool({
    name: "set_landing_page",
    description:
      "Replace ALL of an event's landing page sections with the list given, in order. Call get_event first if you want to keep some of the current sections, and list_section_types for each type's content shape. The hero at the top comes from the event's details and is not a section.",
    input: z.object({ event: eventRef, sections: z.array(sectionSpec).min(1).max(40) }),
    run: async ({ event: ref, sections }, ctx) => {
      const e = await resolveEvent(ref);
      const rows = parseSections(sections);
      await db.transaction(async (tx) => {
        await tx.delete(eventSections).where(eq(eventSections.eventId, e.id));
        await tx.insert(eventSections).values(rows.map((r) => ({ eventId: e.id, ...r })));
      });
      return { replaced: true, sections: rows.map((r) => r.type), ...links(ctx, e) };
    },
  }),

  tool({
    name: "add_sponsor_level",
    description: "Add a sponsorship level to an event (for example Title sponsor, Gold, Associate).",
    input: z.object({ event: eventRef, ...sponsorLevelSpec.shape }),
    run: async ({ event: ref, ...spec }) => {
      const e = await resolveEvent(ref);
      const existing = await db.select().from(sponsorTiers).where(and(eq(sponsorTiers.eventId, e.id)));
      if (existing.some((t) => t.name.toLowerCase() === spec.name.toLowerCase())) {
        throw new AdminInputError(`This event already has a sponsorship level named "${spec.name}"`);
      }
      await addSponsorLevel(e.id, spec);
      return { added: true, level: spec.name };
    },
  }),

  tool({
    name: "set_event_status",
    description:
      "Publish an event or change its status. PUBLISHED makes the page public and opens registration, so only do it when the organiser has explicitly asked for the event to go live. DRAFT hides it again; CLOSED keeps the page up but stops registration; CANCELLED marks it cancelled (tickets are not refunded automatically).",
    input: z.object({ event: eventRef, status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "CANCELLED"]) }),
    run: async ({ event: ref, status }, ctx) => {
      const e = await resolveEvent(ref);
      await setEventStatus(e.id, status);
      return { status, ...links(ctx, e) };
    },
  }),
];
