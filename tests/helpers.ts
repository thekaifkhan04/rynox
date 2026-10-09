import { sql } from "drizzle-orm";
import { db } from "@/db";
import { events, formFields, ticketTypes, user } from "@/db/schema";

export async function resetDb() {
  await db.execute(sql`TRUNCATE rate_limits, api_tokens, sponsors, sponsor_tiers, level_results, competition_levels, competitions, email_logs, refunds, tickets, orders, form_fields,
    event_sections, ticket_types, events, webhook_events, session, account, "user" CASCADE`);
}

let n = 0;

export async function makeUser(email?: string) {
  n++;
  const [u] = await db
    .insert(user)
    .values({ id: `user_${n}_${Date.now()}`, name: `User ${n}`, email: email ?? `u${n}_${Date.now()}@test.dev` })
    .returning();
  return u;
}

export async function makeEvent(
  overrides: Partial<typeof events.$inferInsert> = {},
  types: { name: string; pricePaise: number; quota?: number | null }[] = [
    { name: "General", pricePaise: 50_000 },
  ],
) {
  n++;
  const [event] = await db
    .insert(events)
    .values({
      slug: `event-${n}-${Date.now()}`,
      title: "Test Event",
      venueName: "Stadium",
      startsAt: new Date(Date.now() + 7 * 86_400_000),
      endsAt: new Date(Date.now() + 8 * 86_400_000),
      status: "PUBLISHED",
      maxTicketsPerOrder: 5,
      ...overrides,
    })
    .returning();
  const createdTypes = types.length
    ? await db
        .insert(ticketTypes)
        .values(types.map((t, i) => ({ eventId: event.id, sortOrder: i, quota: null, ...t })))
        .returning()
    : [];
  return { event, types: createdTypes };
}

export async function addField(eventId: string, f: Partial<typeof formFields.$inferInsert> & { key: string; label: string }) {
  await db.insert(formFields).values({ eventId, ...f });
}

export function attendee(ticketTypeId: string, i = 1, answers: Record<string, string | boolean> = {}) {
  return {
    ticketTypeId,
    name: `Runner ${i}`,
    email: `runner${i}@test.dev`,
    phone: "+91 98765 43210",
    organization: "Club",
    answers,
  };
}
