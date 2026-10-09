// Admin smoke test. Needs a running dev server with ALLOW_DEV_LOGIN=true,
// ADMIN_EMAILS containing admin@example.com, the seeded sample event and at
// least one paid ticket on it (run smoke.mjs first).
//   node tests/e2e/admin.mjs [outDir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "tests/e2e/out";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium" });
const errors = [];
const step = (msg) => console.log(`✓ ${msg}`);
/** Choose an option in a shadcn Select by its visible label. */
async function pick(page, trigger, label) {
  await page.click(trigger);
  await page.getByRole("option", { name: label, exact: true }).click();
}

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("401") && errors.push(`console: ${m.text()}`));
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/sign-in?next=/admin`);
  await page.fill("#dev-email", email);
  await page.click("text=Sign in without Google");
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
  return { ctx, page };
}

// A normal user is kept out of the admin area and its APIs.
{
  const { ctx, page } = await login(`nobody+${Date.now()}@example.com`);
  await page.waitForURL(/\/no-access/);
  const res = await ctx.request.get(`${BASE}/api/admin/events/x/export`);
  if (res.status() !== 403) throw new Error(`export should be 403 for non-admins, got ${res.status()}`);
  await ctx.close();
  step("non-admins are redirected and blocked from admin APIs");
}

const { ctx, page } = await login("admin@example.com");
const shot = (name, opts = {}) => page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
await page.waitForSelector("h1:has-text('Dashboard')");
await shot("10-admin-dashboard");
step("admin dashboard loads");

// Create an event.
const title = `Test Throwdown ${Date.now()}`;
await page.click("text=New event");
await page.fill("#title", title);
await page.fill("#startsAt", "2027-03-14T06:00");
await page.fill("#endsAt", "2027-03-14T16:00");
await page.fill("#venueName", "City Arena");
await page.fill("#city", "Cuttack");
await page.fill("#capacity", "50");
await page.fill("#maxTicketsPerOrder", "2");
await page.click("button:has-text('Create event')");
await page.waitForURL(/\/admin\/events\/[^/]+\/tickets/);
const eventId = page.url().split("/").at(-2);
step("event created as a draft");

// Add a paid ticket type.
await page.fill("#new-name", "Women's Deadlift");
await page.fill("#new-price", "499");
await page.fill("#new-quota", "20");
await page.click("button:has-text('Add ticket type')");
await page.waitForSelector("input[value=\"Women's Deadlift\"]");
await shot("11-admin-ticket-types");
step("ticket type added");

// Competitions and levels: a competition with two levels, entered with the new ticket type.
await page.click("nav[aria-label='Event sections'] >> text=Competitions");
await page.fill("#new-competition-name", "Deadlift");
await page.click("button:has-text('Add competition')");
await page.waitForSelector("text=Single contest");
for (const [i, level] of ["Qualifier", "Final"].entries()) {
  await page.getByLabel("New level").fill(level);
  await page.click("button:has-text('Add level')");
  // The saved level gets its own numbered row; only then is the form ready for the next one.
  await page.getByLabel(`Level ${i + 1}`, { exact: true }).waitFor();
}
await page.waitForSelector("text=2 levels");
await page.click("nav[aria-label='Event sections'] >> text=Ticket types");
const typeCard = page.locator("form", { has: page.locator("input[value=\"Women's Deadlift\"]") });
await typeCard.locator("button[role=combobox]").click();
await page.getByRole("option", { name: "Deadlift", exact: true }).click();
await typeCard.locator("button:has-text('Save')").click();
await page.waitForSelector("text=Ticket type saved");
await shot("11b-admin-competitions");
step("competition with two levels created and linked to a ticket type");

// Add a custom question.
await page.click("nav[aria-label='Event sections'] >> text=Registration form");
await page.fill("#new-label", "Weight class");
await pick(page, "#new-type", "Dropdown");
await page.fill("#new-options", "Under 60kg\nUnder 75kg\nOpen");
await page.click("button:has-text('Add question')");
await page.waitForSelector("input[value='Weight class']");
step("custom registration question added");

// Landing page builder: add a stats section and edit it.
await page.click("nav[aria-label='Event sections'] >> text=Landing page");
await page.waitForSelector("iframe[title='Landing page preview']");
await pick(page, "#new-section-type", "Stats");
await page.click("button:has-text('Add section')");
await page.waitForSelector("button:has-text('Save section')");
await page.locator("form[data-section-form] input").first().fill("By the numbers");
await page.click("button:has-text('Save section')");
await page.waitForSelector("text=Section saved");
await page.waitForTimeout(1500);
await shot("12-admin-landing-builder");
step("landing page section added and saved");

// Publish and confirm the public page shows the new content.
await page.click("button:has-text('Publish')");
await page.waitForSelector("text=Event is live");
const slug = (await page.locator("a[href^='/events/']").first().getAttribute("href")).split("/").pop();
const pub = await ctx.request.get(`${BASE}/events/${slug}`);
const html = await pub.text();
for (const needle of ["By the numbers", "Women&#x27;s Deadlift", "₹499", "Qualifier", "One entry covers every level"]) {
  if (!html.includes(needle)) throw new Error(`public page is missing "${needle}"`);
}
step("event published; public page shows the new ticket type and section");

// Registrations on the seeded event.
await page.goto(`${BASE}/admin/events`);
await page.locator("li", { hasText: "RYNOX" }).getByRole("link", { name: "Registrations" }).click();
await page.waitForSelector("table");
await shot("13-admin-registrations");
const firstCode = (await page.locator("tbody tr td:nth-child(2) p.font-mono").first().innerText()).trim();
const seededId = page.url().split("/").at(-2);

const csv = await ctx.request.get(`${BASE}/api/admin/events/${seededId}/export`);
const csvText = await csv.text();
if (csv.status() !== 200 || !csvText.includes(firstCode) || !csvText.includes("T-shirt size")) {
  throw new Error("CSV export is missing expected data");
}
step(`CSV export contains ${csvText.trim().split("\r\n").length - 1} registrations with custom answers`);

// Offline (cash) registration at the offline price.
await page.click("text=Offline registration");
await page.waitForSelector("h2:has-text('Offline registration')");
await page.fill("#a0-name", "Walk In");
await page.fill("#a0-email", "walkin@example.com");
await page.fill("#a0-phone", "9876522222");
await pick(page, "#a0-tshirt", "L");
await page.fill("#a0-emergency_contact", "9876500002");
await page.click("#a0-waiver");
await page.click("button:has-text('Confirm ₹3,000 received')");
await page.waitForURL(/\/registrations$/);
await page.waitForSelector("tbody >> text=Walk In");
// The newest registration is listed first (earlier runs may have left other walk-ins).
if ((await page.locator("tbody tr", { hasText: "Walk In" }).first().locator("text=Offline").count()) !== 1) {
  throw new Error("offline registration should be labelled Offline");
}
await shot("13b-admin-offline");
step("offline registration issued a ticket at the offline price");

await page.fill("#q", firstCode);
await page.click("button:has-text('Apply')");
await page.waitForURL(/q=TKT/);
if ((await page.locator("tbody tr").count()) !== 1) throw new Error("search should match exactly one ticket");
step("search filters the table");

// Check-in by ticket code: first scan succeeds, second reports a duplicate.
await page.click("nav[aria-label='Event sections'] >> text=Check-in");
await page.fill("#manual-code", firstCode);
await page.click("button:has-text('Check in')");
await page.waitForSelector('[aria-live] >> text="Checked in"');
await page.fill("#manual-code", firstCode);
await page.click("button:has-text('Check in')");
await page.waitForSelector("text=Already checked in");
await page.fill("#manual-code", "TKT-NOPE0000");
await page.click("button:has-text('Check in')");
await page.waitForSelector("text=Ticket not found");
await shot("14-admin-check-in");
step("check-in works once, flags the repeat scan and unknown codes");

// Levels: move the entrant through the first level, knock them out at the second, undo it.
await page.click("nav[aria-label='Event sections'] >> text=Levels & results");
await page.waitForSelector("text=to compete");
const entrant = () => page.locator("tr", { hasText: firstCode });
await entrant().locator("input").fill("3:42");
await entrant().locator("button:has-text('Qualify')").click();
await page.waitForSelector("text=qualified for the next level");
await page.locator("tr", { hasText: firstCode }).locator("text=3:42").waitFor();
await entrant().locator("button:has-text('Out')").click();
await page.waitForSelector(`[data-slot=card]:has-text("Out · 1") >> text=${firstCode}`);
await shot("14b-admin-levels");
await entrant().locator("button:has-text('Undo')").click();
await page.waitForSelector("text=Last result undone");
await entrant().locator("button:has-text('Qualify')").waitFor();
const ticketPage = await ctx.request.get(`${BASE}/tickets/${firstCode}`);
if (!(await ticketPage.text()).includes("Level 2 of 5")) throw new Error("ticket should show Level 2 of 5");
step("entrant qualified to level 2, was knocked out, and the result was undone");

// Sponsorship: a brand sends a request, the organiser approves it, it appears in the hero.
{
  const brand = await login(`brand+${Date.now()}@example.com`);
  await brand.page.goto(`${BASE}/events/rynox-ranchi-2026`, { waitUntil: "networkidle" });
  await brand.page.locator("#sponsors >> text=Become a sponsor").first().click();
  await brand.page.waitForURL(/\/sponsor\?level=/);
  await brand.page.fill("#sponsor-companyName", "Hydra Plus");
  await brand.page.fill("#sponsor-phone", "9876533333");
  await brand.page.fill("#sponsor-website", "https://hydra.example");
  await brand.page.click("button:has-text('Send sponsorship request')");
  await brand.page.waitForSelector("text=Request sent");
  const before = await (await brand.ctx.request.get(`${BASE}/events/rynox-ranchi-2026`)).text();
  if (before.includes("Hydra Plus")) throw new Error("a sponsor must not be public before approval");
  await brand.ctx.close();
}
await page.goto(`${BASE}/admin/events/${seededId}/sponsors`);
const request = page.locator("[data-slot=card]", { hasText: "Hydra Plus" });
await request.locator("text=Awaiting review").waitFor();
await request.locator("button:has-text('Approve')").click();
await page.waitForSelector("text=is now shown on the event page");
await request.locator("text=Live on the page").waitFor();
await shot("14c-admin-sponsors");
await page.goto(`${BASE}/events/rynox-ranchi-2026`, { waitUntil: "networkidle" });
await page.locator("section >> nth=0").locator("text=Hydra Plus").waitFor();
await page.locator("#sponsors >> text=Hydra Plus").waitFor();
await page.waitForTimeout(1200);
await shot("14d-hero-sponsor");
await page.goto(`${BASE}/admin/events/${seededId}/registrations?q=${firstCode}`);
step("sponsor request stayed private until approved, then appeared in the hero and sponsors section");

// Resend, then cancel and refund.
await page.goto(`${BASE}/admin/events/${seededId}/registrations?q=${firstCode}`);
await page.click("button[aria-label^='Actions for']");
await page.click("text=Resend ticket email");
await page.waitForSelector("text=Ticket email sent");
step("ticket email resent");
await page.click("button[aria-label^='Actions for']");
await page.click("[role=menuitem]:has-text('Cancel')");
await page.fill("textarea[id^='reason-']", "E2E test");
await page.click("button:has-text('Cancel ticket')");
await page.waitForSelector("text=Ticket cancelled");
await page.waitForSelector("tbody >> text=Cancelled");
await shot("15-admin-cancelled");
step("ticket cancelled and refunded");

await page.click("nav[aria-label='Event sections'] >> text=Check-in");
await page.fill("#manual-code", firstCode);
await page.click("button:has-text('Check in')");
await page.waitForSelector("text=Ticket cancelled");
step("cancelled ticket is rejected at check-in");

await page.goto(`${BASE}/admin/users`);
await page.waitForSelector("text=Set in ADMIN_EMAILS");
// Let hydration finish first: screenshots hide the text caret with an inline style.
await page.waitForLoadState("networkidle");
await shot("16-admin-users");

// Home page: the organiser chooses which event leads it.
{
  const homeCard = async () => {
    const anon = await browser.newContext();
    const p = await anon.newPage();
    await p.goto(BASE, { waitUntil: "networkidle" });
    const text = (await p.locator("article").first().innerText()).replace(/\s+/g, " ");
    await anon.close();
    return text;
  };
  if (!/next up/i.test(await homeCard())) throw new Error("home should start with the next upcoming event");
  await page.goto(`${BASE}/admin/events`);
  await page.locator("[data-slot=card]", { hasText: "First Light Marathon" }).locator("button:has-text('Show on home page')").click();
  await page.waitForSelector("text=First Light Marathon now leads the home page");
  await page.waitForSelector("text=The home page is showing First Light Marathon");
  const chosen = await homeCard();
  if (!/featured/i.test(chosen) || !/first light marathon/i.test(chosen)) throw new Error(`home should feature the chosen event, got: ${chosen}`);
  await shot("16b-admin-home-event");
  await page.locator("button:has-text('On the home page')").click();
  await page.waitForSelector("text=The home page now shows the next upcoming event");
  if (!/next up/i.test(await homeCard())) throw new Error("home should go back to the next upcoming event");
  step("organiser chose the home page event, then returned it to automatic");
}

// AI access: create a token in the dashboard, then drive the MCP endpoint over HTTP like an assistant would.
{
  await page.goto(`${BASE}/admin/ai`);
  await page.fill("#token-name", "E2E assistant");
  await page.click("button:has-text('Create token')");
  await page.waitForSelector("text=Copy this token now");
  const token = (await page.locator("pre", { hasText: "rnx_" }).first().innerText()).trim();
  await shot("17-admin-ai-access");

  const mcp = async (body, auth = `Bearer ${token}`) => {
    const res = await fetch(`${BASE}/api/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(auth ? { Authorization: auth } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: res.status === 202 ? null : await res.json() };
  };
  const tool = async (name, args) => {
    const { json } = await mcp({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } });
    const text = json.result.content[0].text;
    if (json.result.isError) throw new Error(`${name} failed: ${text}`);
    return JSON.parse(text);
  };

  if ((await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "")).status !== 401) throw new Error("MCP must reject calls without a token");
  if ((await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "Bearer rnx_wrong")).status !== 401) throw new Error("MCP must reject a wrong token");
  const init = await mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } });
  if (init.json.result.serverInfo.name !== "event-admin") throw new Error("initialize failed");
  if ((await mcp({ jsonrpc: "2.0", method: "notifications/initialized" })).status !== 202) throw new Error("notification should be accepted");
  const list = await mcp({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  if (!list.json.result.tools.some((t) => t.name === "create_event")) throw new Error("create_event tool missing");

  const made = await tool("create_event", {
    title: `AI Night Run ${Date.now()}`,
    venueName: "Kalinga Stadium",
    city: "Bhubaneswar",
    startsAt: "2027-02-14T18:00",
    endsAt: "2027-02-14T22:00",
    competitions: [{ name: "5K" }, { name: "Sprint", levels: [{ name: "Heats" }, { name: "Final" }] }],
    ticketTypes: [{ name: "5K entry", price: 400, seats: 300, competition: "5K" }, { name: "Sprint entry", price: 700, competition: "Sprint" }],
    formFields: [{ label: "T-shirt size", type: "SELECT", options: ["S", "M", "L"], required: true }],
    sections: [{ type: "richtext", content: { heading: "About the run", body: "An evening run through the city." } }, { type: "tickets", content: { heading: "Enter" } }],
  });
  // A draft made by the assistant shows up in the dashboard and is not public.
  await page.goto(`${BASE}/admin/events/${made.id}/tickets`);
  await page.waitForSelector("input[value='Sprint entry']");
  const anon = await browser.newContext();
  if ((await (await anon.request.get(`${BASE}/events/${made.slug}`)).text()).includes("About the run")) throw new Error("a draft must not be public");
  await tool("set_event_status", { event: made.id, status: "PUBLISHED" });
  const live = await (await anon.request.get(`${BASE}/events/${made.slug}`)).text();
  await anon.close();
  for (const needle of ["About the run", "Sprint entry", "₹700", "Heats"]) {
    if (!live.includes(needle)) throw new Error(`published AI event is missing "${needle}"`);
  }

  await page.goto(`${BASE}/admin/ai`);
  await page.click("button:has-text('Revoke')");
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke token" }).click();
  await page.waitForSelector("text=Token revoked");
  if ((await mcp({ jsonrpc: "2.0", id: 3, method: "tools/list" })).status !== 401) throw new Error("a revoked token must stop working");
  step("AI assistant created and published an event over MCP; token rejected once revoked");
}

// Clean up the throwaway event (unpublish, then delete the draft).
await page.goto(`${BASE}/admin/events/${eventId}`);
await page.click("button:has-text('Unpublish')");
await page.waitForSelector("button:has-text('Delete')");
await page.click("button:has-text('Delete')");
await page.getByRole("alertdialog").getByRole("button", { name: "Delete event" }).click();
await page.waitForURL(/\/admin\/events$/);
step("draft event deleted");

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Admin smoke test passed");
