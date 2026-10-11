import { desc, eq } from "drizzle-orm";
import { AiAccess } from "@/components/admin/ai-access";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/session";
import { TOOLS } from "@/server/mcp/tools";

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export const metadata = { title: "AI access" };

export default async function AiAccessPage() {
  const me = await requireAdmin();
  const tokens = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, me.id))
    .orderBy(desc(apiTokens.createdAt));
  const when = (d: Date | null) => (d ? formatDateTime(d, "Asia/Kolkata") : null);
  return (
    <AiAccess
      url={`${env.appUrl}/api/mcp`}
      tools={TOOLS.map((t) => ({ name: t.name, description: t.description }))}
      tokens={tokens.map((t) => ({
        id: t.id,
        name: t.name,
        prefix: t.prefix,
        createdAt: when(t.createdAt)!,
        lastUsedAt: when(t.lastUsedAt),
        revoked: t.revokedAt != null,
      }))}
    />
  );
}
