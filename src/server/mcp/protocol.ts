import { z } from "zod";
import { AdminInputError } from "../event-admin";
import { OrderError } from "../orders";
import { TOOLS, type ToolContext } from "./tools";

/**
 * A small Model Context Protocol server over "Streamable HTTP", in its
 * stateless form: every request is a JSON-RPC message answered with plain
 * JSON. It only offers tools, which is all an assistant needs here.
 */

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: unknown };
type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

const INSTRUCTIONS = `This server manages events on an event registration and ticketing site.

Typical flow: call list_section_types once to learn the landing page section shapes, then create_event with everything the organiser described. New events are drafts. Give the organiser the adminUrl to review, and only call set_event_status with PUBLISHED when they explicitly ask for the event to go live.

Rules: use only facts the organiser gave you. Do not invent prices, dates, venues, prizes, sponsors or what a ticket includes; leave a field out, or ask, instead. Times are local to the event's timezone (default Asia/Kolkata) in the form 2026-12-20T06:00. Money is in Indian rupees.

An event holds one or more competitions. One competition with several levels is a level-wise event (qualify from each level to reach the next). Several competitions are entered separately. Ticket types are what people buy; each can be assigned to a competition.

These tools cannot delete events, refund payments or change individual registrations. Those are done in the admin dashboard.`;

function describeError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
  }
  if (err instanceof AdminInputError || err instanceof OrderError) return err.message;
  console.error("MCP tool failed", err);
  return "Something went wrong on the server. Nothing was changed by this call unless stated otherwise.";
}

async function callTool(params: unknown, ctx: ToolContext) {
  const { name, arguments: args } = (params ?? {}) as { name?: string; arguments?: unknown };
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return { content: [{ type: "text", text: `Unknown tool "${name}".` }], isError: true };
  }
  try {
    const result = await tool.run(tool.input.parse(args ?? {}), ctx);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    // Tool problems are reported in the result so the assistant can read and fix them.
    return { content: [{ type: "text", text: describeError(err) }], isError: true };
  }
}

async function handleOne(req: JsonRpcRequest, ctx: ToolContext): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  // Notifications carry no id and get no reply.
  if (req.id === undefined) return null;
  switch (req.method) {
    case "initialize": {
      const asked = (req.params as { protocolVersion?: string } | undefined)?.protocolVersion;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: asked && SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: "event-admin", version: "1.0.0" },
          instructions: INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: z.toJSONSchema(t.input, { io: "input" }),
          })),
        },
      };
    case "tools/call":
      return { jsonrpc: "2.0", id, result: await callTool(req.params, ctx) };
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${req.method}` } };
  }
}

/** Handles one HTTP body: a single JSON-RPC message or a batch. null = nothing to send back. */
export async function handleMcp(body: unknown, ctx: ToolContext): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  const isRequest = (m: unknown): m is JsonRpcRequest =>
    typeof m === "object" && m !== null && (m as JsonRpcRequest).jsonrpc === "2.0" && typeof (m as JsonRpcRequest).method === "string";
  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.filter(isRequest).map((m) => handleOne(m, ctx)))).filter(
      (r): r is JsonRpcResponse => r !== null,
    );
    return replies.length ? replies : null;
  }
  if (!isRequest(body)) {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
  }
  return handleOne(body, ctx);
}
