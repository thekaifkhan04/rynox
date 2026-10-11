import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import { db } from "@/db";
import { events } from "@/db/schema";
import { setFeaturedEvent } from "@/server/event-admin";
import { listPublicEvents, pickFeatured } from "@/server/events";
import { makeEvent, resetDb } from "./helpers";

beforeEach(resetDb);

const day = 86_400_000;
const pick = async () => {
  const { event, chosenByOrganiser } = pickFeatured(await listPublicEvents(), new Date());
  return [event?.title ?? null, chosenByOrganiser];
};

it("shows the next event until the organiser chooses one, and only one at a time", async () => {
  const soon = await makeEvent({ title: "Soon", startsAt: new Date(Date.now() + day), endsAt: new Date(Date.now() + 2 * day) });
  const later = await makeEvent({ title: "Later", startsAt: new Date(Date.now() + 30 * day), endsAt: new Date(Date.now() + 31 * day) });
  const far = await makeEvent({ title: "Far", startsAt: new Date(Date.now() + 60 * day), endsAt: new Date(Date.now() + 61 * day) });
  expect(await pick()).toEqual(["Soon", false]);

  await setFeaturedEvent(later.event.id);
  expect(await pick()).toEqual(["Later", true]);

  await setFeaturedEvent(far.event.id);
  expect(await pick()).toEqual(["Far", true]);
  expect((await db.select().from(events).where(eq(events.featuredOnHome, true))).map((e) => e.title)).toEqual(["Far"]);

  await setFeaturedEvent(null);
  expect(await pick()).toEqual(["Soon", false]);
  void soon;
});

it("falls back to the next event when the chosen one is a draft or has finished", async () => {
  await makeEvent({ title: "Next", startsAt: new Date(Date.now() + day), endsAt: new Date(Date.now() + 2 * day) });
  const chosen = await makeEvent({ title: "Chosen", startsAt: new Date(Date.now() + 5 * day), endsAt: new Date(Date.now() + 6 * day) });
  await setFeaturedEvent(chosen.event.id);
  expect(await pick()).toEqual(["Chosen", true]);

  await db.update(events).set({ status: "DRAFT" }).where(eq(events.id, chosen.event.id));
  expect(await pick()).toEqual(["Next", false]);

  await db
    .update(events)
    .set({ status: "PUBLISHED", startsAt: new Date(Date.now() - 2 * day), endsAt: new Date(Date.now() - day) })
    .where(eq(events.id, chosen.event.id));
  expect(await pick()).toEqual(["Next", false]);
});
