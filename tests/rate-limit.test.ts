import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { enforceRateLimit, rateLimit, RateLimitError } from "@/server/rate-limit";
import { resetDb } from "./helpers";

beforeEach(resetDb);

describe("rateLimit", () => {
  it("allows up to the limit, then refuses, separately for each key", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push((await rateLimit("a", 3, 60)).allowed);
    expect(results).toEqual([true, true, true, false, false]);
    expect((await rateLimit("b", 3, 60)).allowed).toBe(true);
    await expect(enforceRateLimit("a", 3, 60)).rejects.toThrow(RateLimitError);
  });

  it("counts simultaneous requests exactly", async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () => rateLimit("burst", 10, 60)));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
  });

  it("starts again once the window has passed and says how long to wait", async () => {
    await rateLimit("w", 1, 60);
    const blocked = await rateLimit("w", 1, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(50);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);

    // Pretend the window began two minutes ago.
    await db.update(rateLimits).set({ windowStart: new Date(Date.now() - 120_000) }).where(eq(rateLimits.key, "w"));
    expect((await rateLimit("w", 1, 60)).allowed).toBe(true);
  });
});
