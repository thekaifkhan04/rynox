import "server-only";
import { createSign } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { env, sheetsConfigured } from "@/lib/env";
import { getEventById } from "./events";
import { registrationTable } from "./export";

export class SheetsError extends Error {}

/** The tab this app owns inside the organiser's spreadsheet. Other tabs are never touched. */
export const SHEET_TAB = "Registrations";

/** Accepts a full Google Sheets link or a bare spreadsheet id. */
export function parseSpreadsheetId(input: string): string | null {
  const value = input.trim();
  const fromUrl = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/);
  if (fromUrl) return fromUrl[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(value) ? value : null;
}

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

let cached: { token: string; expiresAt: number } | null = null;

/** Signs in as the service account (JWT bearer flow) and returns an access token. */
async function accessToken(): Promise<string> {
  if (!sheetsConfigured) throw new SheetsError("Google Sheets is not configured on this server.");
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({
      iss: env.sheetsClientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )}`;
  let signature: string;
  try {
    signature = createSign("RSA-SHA256").update(unsigned).sign(env.sheetsPrivateKey, "base64url");
  } catch {
    throw new SheetsError("GOOGLE_SHEETS_PRIVATE_KEY is not a valid private key.");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok) {
    throw new SheetsError("Google rejected the service account credentials. Check the email and key.");
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 403) {
    throw new SheetsError(
      `The sheet is not shared with this app. In Google Sheets, click Share and add ${env.sheetsClientEmail} as an Editor.`,
    );
  }
  if (res.status === 404) {
    throw new SheetsError("That spreadsheet was not found. Check the link.");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Google Sheets API error", res.status, detail.slice(0, 500));
    throw new SheetsError(`Google Sheets returned an error (${res.status}). Try again in a moment.`);
  }
  return (await res.json()) as T;
}

/**
 * Replaces the "Registrations" tab of the event's sheet with every current
 * registration. Values are written as plain text, so a registrant can never
 * plant a formula in the organiser's spreadsheet.
 */
export async function syncEventToSheet(eventId: string) {
  const event = await getEventById(eventId);
  if (!event) throw new SheetsError("Event not found.");
  if (!event.sheetId) throw new SheetsError("Add a Google Sheet link first.");
  const id = event.sheetId;
  const { header, rows } = await registrationTable(event);

  const meta = await api<{ sheets: { properties: { title: string; sheetId: number } }[] }>(
    `${id}?fields=sheets.properties(title,sheetId)`,
  );
  let tab = meta.sheets.find((s) => s.properties.title === SHEET_TAB)?.properties.sheetId;
  if (tab == null) {
    const added = await api<{ replies: { addSheet: { properties: { sheetId: number } } }[] }>(
      `${id}:batchUpdate`,
      { method: "POST", body: { requests: [{ addSheet: { properties: { title: SHEET_TAB } } }] } },
    );
    tab = added.replies[0].addSheet.properties.sheetId;
  }

  await api(`${id}/values/${SHEET_TAB}:clear`, { method: "POST", body: {} });
  await api(`${id}/values/${SHEET_TAB}!A1?valueInputOption=RAW`, {
    method: "PUT",
    body: { values: [header, ...rows] },
  });
  // Bold, frozen header row so the sheet stays readable as it grows.
  await api(`${id}:batchUpdate`, {
    method: "POST",
    body: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId: tab, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount",
          },
        },
        {
          repeatCell: {
            range: { sheetId: tab, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
      ],
    },
  });

  const syncedAt = new Date();
  await db.update(events).set({ sheetSyncedAt: syncedAt }).where(eq(events.id, event.id));
  return { rows: rows.length, syncedAt };
}
