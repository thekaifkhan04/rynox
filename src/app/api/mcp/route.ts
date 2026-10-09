import { env, isAdminEmail } from "@/lib/env";
import { handleMcp } from "@/server/mcp/protocol";
import { adminForToken } from "@/server/mcp/tokens";
import { LIMITS, rateLimit } from "@/server/rate-limit";

const tooMany = (seconds: number) =>
  Response.json(
    { jsonrpc: "2.0", id: null, error: { code: -32002, message: "Too many requests. Slow down and try again shortly." } },
    { status: 429, headers: { "Retry-After": String(seconds) } },
  );

/**
 * The MCP endpoint AI assistants connect to. Every call must carry an access
 * token created by an admin under Admin > AI access.
 */
export async function POST(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const admin = token ? await adminForToken(token, isAdminEmail) : null;
  if (!admin) {
    // Guessing tokens is throttled per client address.
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    const bad = await rateLimit(`mcp-bad:${ip}`, LIMITS.mcpBadToken.limit, LIMITS.mcpBadToken.windowSeconds);
    if (!bad.allowed) return tooMany(bad.retryAfterSeconds);
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Missing or invalid access token" } },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="mcp"' } },
    );
  }

  const use = await rateLimit(`mcp:${admin.id}`, LIMITS.mcp.limit, LIMITS.mcp.windowSeconds);
  if (!use.allowed) return tooMany(use.retryAfterSeconds);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }
  const reply = await handleMcp(body, { adminId: admin.id, appUrl: env.appUrl });
  // Notifications are accepted without a body.
  if (reply === null) return new Response(null, { status: 202 });
  return Response.json(reply, { headers: { "Cache-Control": "no-store" } });
}

// This server answers each request directly and keeps no open stream or session.
export function GET() {
  return new Response("This MCP endpoint accepts POST requests only.", {
    status: 405,
    headers: { Allow: "POST" },
  });
}

export const DELETE = GET;
