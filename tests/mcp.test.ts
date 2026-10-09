import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { events, user } from "@/db/schema";
import { getEventBySlug } from "@/server/events";
import { handleMcp } from "@/server/mcp/protocol";
import { adminForToken, createApiToken, revokeApiToken } from "@/server/mcp/tokens";
import { makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

const ctx = { adminId: "admin", appUrl: "https://example.test" };
let nextId = 1;

async function rpc(method: string, params?: unknown) {
  const reply = await handleMcp({ jsonrpc: "2.0", id: nextId++, method, params }, ctx);
  // Results are read loosely here: each test asserts on the shape it expects.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return reply as { result?: any; error?: { code: number; message: string } };
}

/** Calls a tool and returns its parsed JSON result, or the error text. */
async function call(name: string, args: unknown = {}) {
  const { result } = await rpc("tools/call", { name, arguments: args });
  const text = result.content[0].text as string;
  return result.isError ? { error: text } : JSON.parse(text);
}

const spec = {
  title: "City Night Run",
  venueName: "Kalinga Stadium",
  city: "Bhubaneswar",
  startsAt: "2027-02-14T18:00",
  endsAt: "2027-02-14T22:00",
  capacity: 600,
  maxTicketsPerOrder: 2,
  competitions: [
    { name: "5K" },
    { name: "Sprint", levels: [{ name: "Heats" }, { name: "Final", description: "Top 8" }] },
  ],
  ticketTypes: [
    { name: "5K entry", price: 400, seats: 300, competition: "5K" },
    { name: "Sprint entry", price: 700, offlinePrice: 800, competition: "sprint" },
  ],
  formFields: [
    { label: "T-shirt size", type: "SELECT", options: ["S", "M", "L"], required: true },
    { label: "Emergency contact", type: "TEXT", required: true },
  ],
  sections: [
    { type: "richtext", content: { heading: "About", body: "An evening run." } },
    { type: "tickets", content: { heading: "Enter" } },
  ],
  sponsorLevels: [{ name: "Title sponsor", places: 1, benefits: ["Logo in the hero"] }],
};

describe("access tokens", () => {
  const never = () => false;

  it("works for an admin, and stops when revoked or when admin access is removed", async () => {
    const admin = await makeUser();
    await db.update(user).set({ role: "ADMIN" }).where(eq(user.id, admin.id));
    const { token, id } = await createApiToken(admin.id, "Laptop");

    expect((await adminForToken(token, never))?.id).toBe(admin.id);
    expect(await adminForToken(`${token}x`, never)).toBeNull();
    expect(await adminForToken("not-a-token", never)).toBeNull();

    await db.update(user).set({ role: "USER" }).where(eq(user.id, admin.id));
    expect(await adminForToken(token, never)).toBeNull();
    await db.update(user).set({ role: "ADMIN" }).where(eq(user.id, admin.id));

    await revokeApiToken(admin.id, id);
    expect(await adminForToken(token, never)).toBeNull();
  });

  it("never stores the token itself", async () => {
    const admin = await makeUser();
    const { token } = await createApiToken(admin.id, "x");
    const rows = await db.query.apiTokens.findMany();
    expect(JSON.stringify(rows)).not.toContain(token);
  });
});

describe("protocol", () => {
  it("initialises, lists tools with valid schemas and ignores notifications", async () => {
    const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {} });
    expect(init.result.protocolVersion).toBe("2025-03-26");
    expect(init.result.capabilities.tools).toBeDefined();

    const { result } = await rpc("tools/list");
    const names = result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(["create_event", "get_event", "set_event_status"]));
    for (const t of result.tools) expect(t.inputSchema.type).toBe("object");

    expect(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx)).toBeNull();
    expect((await rpc("nope")).error?.code).toBe(-32601);
    expect((await call("missing_tool")).error).toMatch(/Unknown tool/);
  });
});

describe("tools", () => {
  it("creates a complete draft event from one call", async () => {
    const res = await call("create_event", spec);
    expect(res).toMatchObject({ created: true, status: "DRAFT", slug: "city-night-run" });
    expect(res.adminUrl).toBe(`https://example.test/admin/events/${res.id}`);

    const e = (await getEventBySlug("city-night-run"))!;
    expect(e.status).toBe("DRAFT");
    expect(e.capacity).toBe(600);
    // 6:00 PM IST is 12:30 UTC.
    expect(e.startsAt.toISOString()).toBe("2027-02-14T12:30:00.000Z");
    expect(e.competitions.map((c) => [c.name, c.levels.map((l) => l.name)])).toEqual([
      ["5K", []],
      ["Sprint", ["Heats", "Final"]],
    ]);
    const sprint = e.ticketTypes.find((t) => t.name === "Sprint entry")!;
    expect(sprint.pricePaise).toBe(70_000);
    expect(sprint.offlinePricePaise).toBe(80_000);
    expect(sprint.competitionId).toBe(e.competitions[1].id);
    expect(e.ticketTypes[0].quota).toBe(300);
    expect(e.formFields.map((f) => f.key)).toEqual(["t_shirt_size", "emergency_contact"]);
    expect(e.sections.map((s) => s.type)).toEqual(["richtext", "tickets"]);

    const read = await call("get_event", { event: "city-night-run" });
    expect(read.sponsorLevels).toEqual([
      { name: "Title sponsor", benefits: ["Logo in the hero"], amount: null, places: 1, showInHero: true },
    ]);
    expect(read.details.startsAt).toBe("2027-02-14T18:00");
  });

  it("adds a starter ticket and landing page when they are left out", async () => {
    const { competitions, ticketTypes, formFields, sections, sponsorLevels, ...bare } = spec;
    void [competitions, ticketTypes, formFields, sections, sponsorLevels];
    const res = await call("create_event", bare);
    expect(res.usedStarterLandingPage).toBe(true);
    const e = (await getEventBySlug("city-night-run"))!;
    expect(e.ticketTypes.map((t) => [t.name, t.pricePaise])).toEqual([["General entry", 0]]);
    expect(e.sections.length).toBeGreaterThan(3);
  });

  it("creates nothing when part of the request is wrong", async () => {
    const badSection = await call("create_event", { ...spec, sections: [{ type: "carousel", content: {} }] });
    expect(badSection.error).toMatch(/Unknown section type "carousel"/);

    const badCompetition = await call("create_event", {
      ...spec,
      ticketTypes: [{ name: "Entry", price: 100, competition: "Marathon" }],
    });
    expect(badCompetition.error).toMatch(/no competition named "Marathon"/);

    const badPrice = await call("create_event", { ...spec, ticketTypes: [{ name: "Entry", price: 0.5 }] });
    expect(badPrice.error).toMatch(/at least ₹1/);

    const badDates = await call("create_event", { ...spec, endsAt: "2027-02-14T17:00" });
    expect(badDates.error).toMatch(/end after it starts/);

    expect(await db.select().from(events)).toHaveLength(0);
  });

  it("edits an event and only publishes when asked", async () => {
    await call("create_event", spec);

    const updated = await call("update_event", { event: "city-night-run", city: "Cuttack", capacity: 800 });
    expect(updated.updated).toBe(true);
    await call("upsert_ticket_type", { event: "city-night-run", name: "5K entry", price: 450 });
    await call("upsert_ticket_type", { event: "city-night-run", name: "Spectator", price: 0 });
    await call("upsert_competition", { event: "city-night-run", name: "5K", levels: [{ name: "Race" }] });
    await call("add_form_field", { event: "city-night-run", label: "Club", type: "TEXT" });
    expect((await call("add_form_field", { event: "city-night-run", label: "club" })).error).toMatch(/already asks/);
    await call("set_landing_page", {
      event: "city-night-run",
      sections: [{ type: "cta", content: { heading: "Run at night", buttonLabel: "Register" } }],
    });

    let e = (await getEventBySlug("city-night-run"))!;
    expect(e.city).toBe("Cuttack");
    expect(e.capacity).toBe(800);
    // Untouched fields keep their value.
    expect(e.venueName).toBe("Kalinga Stadium");
    expect(e.startsAt.toISOString()).toBe("2027-02-14T12:30:00.000Z");
    expect(e.ticketTypes.map((t) => [t.name, t.pricePaise, t.quota])).toEqual([
      ["5K entry", 45_000, 300],
      ["Sprint entry", 70_000, null],
      ["Spectator", 0, null],
    ]);
    expect(e.competitions[0].levels.map((l) => l.name)).toEqual(["Race"]);
    expect(e.formFields).toHaveLength(3);
    expect(e.sections.map((s) => s.type)).toEqual(["cta"]);
    expect(e.status).toBe("DRAFT");

    expect(await call("set_event_status", { event: e.id, status: "PUBLISHED" })).toMatchObject({ status: "PUBLISHED" });
    e = (await getEventBySlug("city-night-run"))!;
    expect(e.status).toBe("PUBLISHED");

    expect((await call("get_event", { event: "does-not-exist" })).error).toMatch(/No event found/);
  });
});
