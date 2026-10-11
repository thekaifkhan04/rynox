import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { eventSections, events, ticketTypes } from "@/db/schema";
import { fromLocalInput } from "@/lib/dates";
import { DEFAULT_SECTIONS, SECTIONS } from "@/sections/registry";
import { slugify } from "./codes";

/** A problem with what the organiser entered; the message is safe to show them. */
export class AdminInputError extends Error {}

const optional = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

export const eventSchema = z.object({
  title: z.string().trim().min(2, "Give the event a title").max(120),
  slug: z.string().trim().max(80),
  tagline: optional(120),
  summary: optional(600),
  coverImageUrl: optional(2000),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a valid accent colour"),
  venueName: z.string().trim().min(2, "Enter the venue name").max(160),
  venueAddress: optional(300),
  city: optional(80),
  mapUrl: optional(2000),
  timezone: z.string().trim().min(1),
  startsAt: z.string().min(1, "Set the start date and time"),
  endsAt: z.string().min(1, "Set the end date and time"),
  registrationOpensAt: z.string(),
  registrationClosesAt: z.string(),
  capacity: z.string().trim(),
  maxTicketsPerOrder: z.coerce.number().int().min(1, "At least 1 ticket per order").max(20),
});

export type EventInput = z.input<typeof eventSchema>;

function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create (id null) or update an event's details. A new event is a draft.
 * With `starter`, a new event also gets a free ticket type and the default
 * landing page, so it looks finished before anything else is set up.
 */
export async function saveEvent(
  id: string | null,
  input: EventInput,
  opts: { starter?: boolean } = { starter: true },
) {
  const v = eventSchema.parse(input);
  if (!isValidTimezone(v.timezone)) throw new AdminInputError("Unknown timezone");
  const startsAt = fromLocalInput(v.startsAt, v.timezone);
  const endsAt = fromLocalInput(v.endsAt, v.timezone);
  if (!startsAt || !endsAt) throw new AdminInputError("Enter valid start and end times");
  if (endsAt <= startsAt) throw new AdminInputError("The event must end after it starts");
  const capacity = v.capacity === "" ? null : Number(v.capacity);
  if (capacity != null && (!Number.isInteger(capacity) || capacity < 1)) {
    throw new AdminInputError("Capacity must be a whole number, or empty for no limit");
  }

  const slug = slugify(v.slug || v.title);
  if (!slug) throw new AdminInputError("Enter a URL slug using letters and numbers");
  const [clash] = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug));
  if (clash && clash.id !== id) {
    throw new AdminInputError(`The URL "${slug}" is already used by another event`);
  }

  const values = {
    title: v.title,
    slug,
    tagline: v.tagline,
    summary: v.summary,
    coverImageUrl: v.coverImageUrl,
    accentColor: v.accentColor.toLowerCase(),
    venueName: v.venueName,
    venueAddress: v.venueAddress,
    city: v.city,
    mapUrl: v.mapUrl,
    timezone: v.timezone,
    startsAt,
    endsAt,
    registrationOpensAt: fromLocalInput(v.registrationOpensAt, v.timezone),
    registrationClosesAt: fromLocalInput(v.registrationClosesAt, v.timezone),
    capacity,
    maxTicketsPerOrder: v.maxTicketsPerOrder,
  };

  if (id) {
    await db.update(events).set(values).where(eq(events.id, id));
    return { id, slug };
  }
  const created = await db.transaction(async (tx) => {
    const [event] = await tx.insert(events).values(values).returning();
    if (opts.starter) {
      await tx.insert(ticketTypes).values({ eventId: event.id, name: "General entry", pricePaise: 0 });
      await tx.insert(eventSections).values(
        DEFAULT_SECTIONS.map((type, i) => ({
          eventId: event.id,
          type,
          sortOrder: i,
          content: SECTIONS[type].schema.parse(SECTIONS[type].defaults) as Record<string, unknown>,
        })),
      );
    }
    return event;
  });
  return { id: created.id, slug };
}

/**
 * Choose the event that leads the home page, or pass null to go back to
 * showing whichever event is next. Only one event is featured at a time.
 */
export async function setFeaturedEvent(id: string | null) {
  await db.transaction(async (tx) => {
    await tx.update(events).set({ featuredOnHome: false }).where(eq(events.featuredOnHome, true));
    if (id) await tx.update(events).set({ featuredOnHome: true }).where(eq(events.id, id));
  });
}

export async function setEventStatus(
  id: string,
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "CANCELLED",
) {
  if (status === "PUBLISHED") {
    const [{ n }] = await db
      .select({ n: count() })
      .from(ticketTypes)
      .where(and(eq(ticketTypes.eventId, id), eq(ticketTypes.active, true)));
    if (n === 0) throw new AdminInputError("Add at least one active ticket type before publishing");
  }
  await db.update(events).set({ status }).where(eq(events.id, id));
}
