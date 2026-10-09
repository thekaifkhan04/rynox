import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { events, sponsorTiers, sponsors } from "@/db/schema";
import { applyToSponsor, getSponsorship, setSponsorStatus } from "@/server/sponsors";
import { makeEvent, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

async function setup() {
  const { event } = await makeEvent();
  const [title, associate] = await db
    .insert(sponsorTiers)
    .values([
      { eventId: event.id, name: "Title", slots: 1, sortOrder: 0, showInHero: true },
      { eventId: event.id, name: "Associate", slots: null, sortOrder: 1, showInHero: false },
    ])
    .returning();
  const application = (tierId: string, companyName: string) => ({
    eventId: event.id,
    tierId,
    companyName,
    contactName: "Priya Nair",
    email: "Priya@Brand.com",
    phone: "+91 98765 43210",
    website: "https://brand.example",
    logoUrl: "",
    message: "",
  });
  return { event, title, associate, application };
}

describe("sponsorship", () => {
  it("keeps a request private until it is approved, then shows it at its level and in the hero", async () => {
    const { event, title, associate, application } = await setup();
    const brand = await applyToSponsor(await makeUser(), application(title.id, "Hydra+"));
    const small = await applyToSponsor(await makeUser(), application(associate.id, "Stride Labs"));
    expect(brand.status).toBe("PENDING");
    expect(brand.email).toBe("priya@brand.com");

    let s = await getSponsorship(event.id);
    expect(s.tiers.flatMap((t) => t.sponsors)).toHaveLength(0);
    expect(s.hero).toHaveLength(0);

    await setSponsorStatus(brand.id, "APPROVED");
    await setSponsorStatus(small.id, "APPROVED");
    s = await getSponsorship(event.id);
    expect(s.tiers.map((t) => [t.name, t.sponsors.map((x) => x.companyName), t.remaining])).toEqual([
      ["Title", ["Hydra+"], 0],
      ["Associate", ["Stride Labs"], null],
    ]);
    // Only levels flagged for the hero appear there.
    expect(s.hero.map((h) => h.sponsor.companyName)).toEqual(["Hydra+"]);

    await setSponsorStatus(brand.id, "REJECTED");
    s = await getSponsorship(event.id);
    expect(s.hero).toHaveLength(0);
    expect(s.tiers[0].remaining).toBe(1);
  });

  it("never lets a level take more sponsors than it has places", async () => {
    const { title, application } = await setup();
    const first = await applyToSponsor(await makeUser(), application(title.id, "First"));
    const second = await applyToSponsor(await makeUser(), application(title.id, "Second"));
    await setSponsorStatus(first.id, "APPROVED");
    await expect(setSponsorStatus(second.id, "APPROVED")).rejects.toThrow(/already has 1 sponsor/);
    await expect(applyToSponsor(await makeUser(), application(title.id, "Third"))).rejects.toThrow(
      /fully taken/,
    );
  });

  it("rejects bad input, closed levels, finished events and repeat requests", async () => {
    const { event, title, associate, application } = await setup();
    const user = await makeUser();
    await expect(
      applyToSponsor(user, { ...application(title.id, "Brand"), website: "javascript:alert(1)" }),
    ).rejects.toThrow(/full link/);
    await expect(applyToSponsor(user, { ...application(title.id, "Brand"), phone: "abc" })).rejects.toThrow(
      /phone/,
    );

    await applyToSponsor(user, application(title.id, "Brand"));
    await expect(applyToSponsor(user, application(associate.id, "Brand"))).rejects.toThrow(
      /already have a sponsorship request/,
    );

    await db.update(sponsorTiers).set({ active: false }).where(eq(sponsorTiers.id, associate.id));
    await expect(applyToSponsor(await makeUser(), application(associate.id, "Late"))).rejects.toThrow(
      /not available/,
    );

    await db.update(events).set({ endsAt: new Date(Date.now() - 1000) }).where(eq(events.id, event.id));
    await expect(applyToSponsor(await makeUser(), application(title.id, "Late"))).rejects.toThrow(
      /no longer taking sponsors/,
    );
    expect(await db.select().from(sponsors)).toHaveLength(1);
  });
});
