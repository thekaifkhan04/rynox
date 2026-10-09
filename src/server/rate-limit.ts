import { lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super("Too many attempts. Please wait a few minutes and try again.");
  }
}

/**
 * Allows `limit` uses of `key` per window, counted in one atomic statement so
 * simultaneous requests cannot slip past. Returns whether this use is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const window = sql`make_interval(secs => ${windowSeconds})`;
  const result = await db.execute<{ count: number; retry_after: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - ${window} THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - ${window} THEN now() ELSE rate_limits.window_start END
    RETURNING count, ceil(extract(epoch FROM (window_start + ${window} - now())))::int AS retry_after
  `);
  const row = result.rows[0];
  // Old counters are swept now and then; no scheduled job is needed.
  if (Math.random() < 0.01) {
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(Date.now() - 86_400_000)));
  }
  return { allowed: row.count <= limit, retryAfterSeconds: Math.max(1, row.retry_after) };
}

/** Throws a RateLimitError when the key is over its limit. */
export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const { allowed, retryAfterSeconds } = await rateLimit(key, limit, windowSeconds);
  if (!allowed) throw new RateLimitError(retryAfterSeconds);
}

/** The limits in one place. Generous for real people, tight for scripts. */
export const LIMITS = {
  /** New registrations per account. Each one holds seats for 15 minutes. */
  register: { limit: 10, windowSeconds: 10 * 60 },
  /** Opening the payment window, per account. */
  startPayment: { limit: 30, windowSeconds: 10 * 60 },
  /** Sponsorship requests per account. */
  sponsorApply: { limit: 5, windowSeconds: 60 * 60 },
  /** MCP calls per access token. */
  mcp: { limit: 120, windowSeconds: 60 },
  /** MCP calls with a missing or wrong token, per client address. */
  mcpBadToken: { limit: 20, windowSeconds: 60 },
} as const;
