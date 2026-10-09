import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { events, sponsorTiers, sponsors, type Sponsor, type SponsorTier } from "@/db/schema";
import { OrderError } from "./orders";

export type TierWithSponsors = SponsorTier & {
  /** Approved sponsors only: the ones shown publicly. */
  sponsors: Sponsor[];
  /** Places still open at this level. null = no limit. */
  remaining: number | null;
};

export type Sponsorship = {
  tiers: TierWithSponsors[];
  /** Approved sponsors whose level is shown in the hero, highest level first. */
  hero: { sponsor: Sponsor; tier: SponsorTier }[];
  /** True when there is anything to show: a sponsor, or a level open to applications. */
  hasContent: boolean;
};

/** An event's sponsorship levels and the sponsors approved at each. */
export async function getSponsorship(eventId: string): Promise<Sponsorship> {
  const tiers = await db.query.sponsorTiers.findMany({
    where: eq(sponsorTiers.eventId, eventId),
    orderBy: [asc(sponsorTiers.sortOrder), asc(sponsorTiers.createdAt)],
    with: {
      sponsors: { where: eq(sponsors.status, "APPROVED"), orderBy: [asc(sponsors.createdAt)] },
    },
  });
  const withRemaining = tiers.map((t) => ({
    ...t,
    remaining: t.slots == null ? null : Math.max(0, t.slots - t.sponsors.length),
  }));
  return {
    tiers: withRemaining,
    hero: withRemaining
      .filter((t) => t.showInHero)
      .flatMap((tier) => tier.sponsors.map((sponsor) => ({ sponsor, tier }))),
    hasContent: withRemaining.some((t) => t.sponsors.length > 0 || t.active),
  };
}

const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(v), "Enter a full link starting with https://")
  .transform((v) => v || null);

export const sponsorApplicationSchema = z.object({
  eventId: z.string().min(1),
  tierId: z.string().min(1, "Choose a sponsorship level"),
  companyName: z.string().trim().min(2, "Enter the company or brand name").max(120),
  contactName: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{7,16}$/, "Enter a valid phone number"),
  website: optionalUrl,
  logoUrl: optionalUrl,
  message: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => v || null),
});

export type SponsorApplicationInput = z.input<typeof sponsorApplicationSchema>;

async function approvedCount(tierId: string) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(sponsors)
    .where(and(eq(sponsors.tierId, tierId), eq(sponsors.status, "APPROVED")));
  return n;
}

/**
 * A sponsor asks to sponsor an event at a level. Nothing is shown publicly
 * until an organiser approves it.
 */
export async function applyToSponsor(user: { id: string }, raw: SponsorApplicationInput) {
  const parsed = sponsorApplicationSchema.safeParse(raw);
  if (!parsed.success) throw new OrderError(parsed.error.issues[0]?.message ?? "Check the form");
  const input = parsed.data;

  const [event] = await db.select().from(events).where(eq(events.id, input.eventId));
  if (!event || event.status === "DRAFT") throw new OrderError("Event not found");
  if (event.status === "CANCELLED" || event.endsAt < new Date()) {
    throw new OrderError("This event is no longer taking sponsors.");
  }
  const [tier] = await db
    .select()
    .from(sponsorTiers)
    .where(and(eq(sponsorTiers.id, input.tierId), eq(sponsorTiers.eventId, event.id)));
  if (!tier || !tier.active) throw new OrderError("That sponsorship level is not available.");
  if (tier.slots != null && (await approvedCount(tier.id)) >= tier.slots) {
    throw new OrderError(`${tier.name} is fully taken. Please choose another level.`);
  }

  const [existing] = await db
    .select({ id: sponsors.id })
    .from(sponsors)
    .where(
      and(
        eq(sponsors.eventId, event.id),
        eq(sponsors.userId, user.id),
        eq(sponsors.status, "PENDING"),
      ),
    );
  if (existing) {
    throw new OrderError("You already have a sponsorship request for this event awaiting review.");
  }

  const [created] = await db
    .insert(sponsors)
    .values({ ...input, userId: user.id })
    .returning();
  return created;
}

/** Throws when a level has no place left for one more approved sponsor. */
export async function assertTierHasRoom(tierId: string) {
  const [tier] = await db.select().from(sponsorTiers).where(eq(sponsorTiers.id, tierId));
  if (tier?.slots != null && (await approvedCount(tier.id)) >= tier.slots) {
    throw new OrderError(
      `${tier.name} already has ${tier.slots} sponsor${tier.slots === 1 ? "" : "s"}. Raise its limit or choose another level.`,
    );
  }
}

/** Approving respects the level's limit, so a level is never oversubscribed. */
export async function setSponsorStatus(sponsorId: string, status: Sponsor["status"]) {
  const [sponsor] = await db.select().from(sponsors).where(eq(sponsors.id, sponsorId));
  if (!sponsor) throw new OrderError("Sponsor not found");
  if (status === "APPROVED" && sponsor.status !== "APPROVED") await assertTierHasRoom(sponsor.tierId);
  await db.update(sponsors).set({ status }).where(eq(sponsors.id, sponsorId));
}
