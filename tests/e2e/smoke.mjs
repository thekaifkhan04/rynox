// End-to-end smoke test against a running dev server (pnpm dev) with
// ALLOW_DEV_LOGIN=true and no Razorpay keys (simulated payments).
//   node tests/e2e/smoke.mjs [outDir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "tests/e2e/out";
const SLUG = process.env.EVENT_SLUG ?? "rynox-ranchi-2026";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
// The dev login tries sign-in before sign-up, so one 401 is expected.
page.on("console", (m) => m.type() === "error" && !m.text().includes("401") && errors.push(`console: ${m.text()}`));
const shot = (name, opts = {}) => page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
const step = (msg) => console.log(`✓ ${msg}`);
/** Choose an option in a shadcn Select by its visible label (or position). */
async function pick(trigger, option) {
  await page.click(trigger);
  const options = page.getByRole("option");
  await (typeof option === "number" ? options.nth(option) : options.filter({ hasText: option }).first()).click();
}

await page.goto(BASE, { waitUntil: "networkidle" });
await shot("01-home");
await page.goto(`${BASE}/events/${SLUG}`, { waitUntil: "networkidle" });
await shot("02-event", { fullPage: true });
step("home and event pages render");

// Registration requires sign-in.
await page.goto(`${BASE}/events/${SLUG}/register`);
await page.waitForURL(/\/sign-in/);
await page.fill("#dev-email", `athlete+${Date.now()}@example.com`);
await page.click("text=Sign in without Google");
await page.waitForURL(new RegExp(`/events/${SLUG}/register`));
step("dev login redirects back to registration");

await page.fill("#a0-phone", "+91 98765 43210");
await page.fill("#a0-org", "Run Club");
await pick("#a0-tshirt", "M");
await page.fill("#a0-emergency_contact", "9876500000");
await page.click("#a0-waiver");
await page.click("text=Add another ticket");
await pick("#a1-type", 1);
await page.fill("#a1-name", "Second Athlete");
await page.fill("#a1-email", "second@example.com");
await page.fill("#a1-phone", "9876511111");
await pick("#a1-tshirt", "L");
await page.fill("#a1-emergency_contact", "9876500001");
await page.click("#a1-waiver");
await shot("03-register", { fullPage: true });
await page.click("text=Continue to payment");
await page.waitForURL(/\/orders\//);
await page.waitForSelector("text=Complete your payment");
await shot("04-order-pending");
step("order created with seats held");

await page.click("button:has-text('Pay ')");
await page.waitForSelector("text=You're in.", { timeout: 20_000 });
await shot("05-order-paid");
step("payment confirmed");

await page.click("text=View ticket >> nth=0");
await page.waitForURL(/\/tickets\/TKT-/);
await page.waitForSelector("[role=img][aria-label^='QR code']");
await shot("06-ticket");
const code = page.url().split("/").pop();
const pdf = await ctx.request.get(`${BASE}/tickets/${code}/pdf`);
if (pdf.status() !== 200 || !(await pdf.body()).subarray(0, 4).equals(Buffer.from("%PDF"))) {
  throw new Error(`PDF download failed: ${pdf.status()}`);
}
step(`ticket ${code} shows a QR code and downloads as PDF`);

await page.goto(`${BASE}/tickets`, { waitUntil: "networkidle" });
await shot("07-my-tickets");

// Another user must not see this ticket; nor may anonymous visitors.
const other = await browser.newContext();
const anon = await other.request.get(`${BASE}/tickets/${code}/pdf`);
if (anon.status() !== 401) throw new Error(`anonymous PDF should be 401, got ${anon.status()}`);
step("ticket is private to its owner");
await other.close();

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const m = await mobile.newPage();
await m.goto(`${BASE}/events/${SLUG}`, { waitUntil: "networkidle" });
await m.screenshot({ path: `${OUT}/08-event-mobile.png`, fullPage: true });
const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (overflow) throw new Error("event page scrolls horizontally on mobile");
step("mobile layout has no horizontal overflow");

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Smoke test passed");
