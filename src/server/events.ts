import "server-only";
import { cache } from "react";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  competitionLevels,
  competitions,
  eventSections,
  events,
  formFields,
  ticketTypes,
} from "@/db/schema";

export async function listPublicEvents() {
  return db.query.events.findMany({
    where: inArray(events.status, ["PUBLISHED", "CLOSED"]),
    orderBy: [asc(events.startsAt)],
    with: {
      ticketTypes: { where: eq(ticketTypes.active, true) },
      competitions: {
        orderBy: [asc(competitions.sortOrder), asc(competitions.createdAt)],
        with: { levels: true },
      },
    },
  });
}

export type PublicEvent = Awaited<ReturnType<typeof listPublicEvents>>[number];

/**
 * The event that leads the home page: the one the organiser featured, as
 * long as it is public and has not finished; otherwise the next one coming up.
 */
export function pickFeatured(all: PublicEvent[], now: Date) {
  const upcoming = all.filter((e) => e.endsAt >= now);
  const chosen = upcoming.find((e) => e.featuredOnHome);
  return { event: chosen ?? upcoming[0] ?? null, chosenByOrganiser: Boolean(chosen), upcoming };
}

/**
 * Everything the public event page and the registration form need.
 * Shared within a request, so the page and its metadata make one query.
 */
export const getEventBySlug = cache(async (slug: string) => {
  return db.query.events.findFirst({
    where: eq(events.slug, slug),
    with: {
      ticketTypes: { orderBy: [asc(ticketTypes.sortOrder), asc(ticketTypes.createdAt)] },
      competitions: {
        orderBy: [asc(competitions.sortOrder), asc(competitions.createdAt)],
        with: { levels: { orderBy: [asc(competitionLevels.sortOrder)] } },
      },
      sections: { orderBy: [asc(eventSections.sortOrder)] },
      formFields: { orderBy: [asc(formFields.sortOrder)] },
    },
  });
});

export async function getEventById(id: string) {
  return db.query.events.findFirst({
    where: eq(events.id, id),
    with: {
      ticketTypes: { orderBy: [asc(ticketTypes.sortOrder), asc(ticketTypes.createdAt)] },
      competitions: {
        orderBy: [asc(competitions.sortOrder), asc(competitions.createdAt)],
        with: { levels: { orderBy: [asc(competitionLevels.sortOrder)] } },
      },
      sections: { orderBy: [asc(eventSections.sortOrder)] },
      formFields: { orderBy: [asc(formFields.sortOrder)] },
    },
  });
}

export async function listAllEvents() {
  return db.select().from(events).orderBy(desc(events.startsAt));
}

export type EventWithDetails = NonNullable<Awaited<ReturnType<typeof getEventBySlug>>>;
