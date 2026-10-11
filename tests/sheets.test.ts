import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Credentials have to exist before the app's env module is first imported.
await vi.hoisted(async () => {
  const { generateKeyPairSync } = await import("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  process.env.GOOGLE_SHEETS_CLIENT_EMAIL = "sync@project.iam.gserviceaccount.com";
  // Stored the way env editors keep it: one line with literal \n.
  process.env.GOOGLE_SHEETS_PRIVATE_KEY = privateKey.replace(/\n/g, "\\n");
});

import { db } from "@/db";
import { events } from "@/db/schema";
import { createOrder, fulfillOrder } from "@/server/orders";
import { parseSpreadsheetId, syncEventToSheet } from "@/server/sheets";
import { attendee, makeEvent, makeUser, resetDb } from "./helpers";

const SHEET = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefg";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];

/** A stand-in for Google: records every request and answers like the real API. */
function mockGoogle(opts: { status?: number; hasTab?: boolean } = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input);
      const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
      calls.push({ url, method: init.method ?? "GET", body });
      if (url.includes("oauth2.googleapis.com")) {
        return Response.json({ access_token: "token-123", expires_in: 3600 });
      }
      if (opts.status) return new Response("nope", { status: opts.status });
      if (url.includes("?fields=sheets")) {
        return Response.json({
          sheets: opts.hasTab ? [{ properties: { title: "Registrations", sheetId: 7 } }] : [],
        });
      }
      if (url.endsWith(":batchUpdate") && body?.requests?.[0]?.addSheet) {
        return Response.json({ replies: [{ addSheet: { properties: { sheetId: 42 } } }] });
      }
      return Response.json({});
    }),
  );
}

beforeEach(resetDb);
afterEach(() => vi.unstubAllGlobals());

describe("parseSpreadsheetId", () => {
  it("reads the id from a link or accepts a bare id", () => {
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=0`)).toBe(SHEET);
    expect(parseSpreadsheetId(`  ${SHEET} `)).toBe(SHEET);
    expect(parseSpreadsheetId("https://example.com/spreadsheets")).toBeNull();
    expect(parseSpreadsheetId("not a sheet")).toBeNull();
  });
});

describe("syncEventToSheet", () => {
  async function eventWithRegistration() {
    const { event, types } = await makeEvent();
    await db.update(events).set({ sheetId: SHEET }).where(eq(events.id, event.id));
    const order = await createOrder(await makeUser(), {
      eventId: event.id,
      // A name that would be a formula if the sheet interpreted it.
      attendees: [{ ...attendee(types[0].id), name: "=HYPERLINK(1)" }],
    });
    await fulfillOrder(order.id, "pay_1");
    return event;
  }

  it("creates the tab, clears it and writes every registration as plain text", async () => {
    const event = await eventWithRegistration();
    mockGoogle({ hasTab: false });

    const res = await syncEventToSheet(event.id);
    expect(res.rows).toBe(1);

    const token = calls.find((c) => c.url.includes("oauth2.googleapis.com"));
    expect(token).toBeDefined();
    expect(calls.some((c) => (c.body as { requests?: { addSheet?: unknown }[] })?.requests?.[0]?.addSheet)).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/values/Registrations:clear"))).toBe(true);

    const write = calls.find((c) => c.method === "PUT")!;
    expect(write.url).toContain(`${SHEET}/values/Registrations!A1?valueInputOption=RAW`);
    const values = (write.body as { values: string[][] }).values;
    expect(values[0].slice(0, 3)).toEqual(["Ticket ID", "Name", "Email"]);
    expect(values).toHaveLength(2);
    expect(values[1][1]).toBe("=HYPERLINK(1)"); // stored as text because of RAW

    const [saved] = await db.select().from(events).where(eq(events.id, event.id));
    expect(saved.sheetSyncedAt).toBeInstanceOf(Date);
  });

  it("reuses an existing Registrations tab", async () => {
    const event = await eventWithRegistration();
    mockGoogle({ hasTab: true });
    await syncEventToSheet(event.id);
    expect(calls.some((c) => (c.body as { requests?: { addSheet?: unknown }[] })?.requests?.[0]?.addSheet)).toBe(false);
  });

  it("explains how to fix a sheet that is not shared", async () => {
    const event = await eventWithRegistration();
    mockGoogle({ status: 403 });
    await expect(syncEventToSheet(event.id)).rejects.toThrow(/add sync@project\.iam\.gserviceaccount\.com as an Editor/);
    const [saved] = await db.select().from(events).where(eq(events.id, event.id));
    expect(saved.sheetSyncedAt).toBeNull();
  });

  it("refuses when no sheet is linked", async () => {
    const { event } = await makeEvent();
    mockGoogle();
    await expect(syncEventToSheet(event.id)).rejects.toThrow(/Add a Google Sheet link first/);
    expect(calls).toHaveLength(0);
  });
});
