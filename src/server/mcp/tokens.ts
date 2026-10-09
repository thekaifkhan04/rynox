import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, user } from "@/db/schema";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a token for an admin. The plain token is returned once and never stored. */
export async function createApiToken(userId: string, name: string) {
  const token = `rnx_${randomBytes(32).toString("base64url")}`;
  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name: name.trim().slice(0, 80) || "AI assistant", tokenHash: hash(token), prefix: token.slice(0, 10) })
    .returning();
  return { token, id: row.id };
}

export async function revokeApiToken(userId: string, id: string) {
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)));
}

/**
 * The admin a bearer token belongs to, or null. A token stops working the
 * moment it is revoked or its owner loses admin access.
 */
export async function adminForToken(
  token: string,
  isAdminEmail: (email: string) => boolean,
): Promise<{ id: string; name: string; email: string } | null> {
  if (!token.startsWith("rnx_")) return null;
  const [row] = await db
    .select({ tokenId: apiTokens.id, user })
    .from(apiTokens)
    .innerJoin(user, eq(apiTokens.userId, user.id))
    .where(and(eq(apiTokens.tokenHash, hash(token)), isNull(apiTokens.revokedAt)));
  if (!row) return null;
  if (row.user.role !== "ADMIN" && !isAdminEmail(row.user.email)) return null;
  await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.tokenId));
  return { id: row.user.id, name: row.user.name, email: row.user.email };
}
