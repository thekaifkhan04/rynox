# RYNOX — event registration and ticketing

A full-stack Next.js app for running sports and endurance events: per-event landing pages,
registration with custom questions, Razorpay payments, QR tickets by email and PDF, and an
organiser dashboard with refunds, CSV export and gate check-in.

**Stack:** Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind 4 · shadcn/ui ·
PostgreSQL + Drizzle · GSAP + Motion · Better Auth (Google) · Razorpay · Resend or SMTP (Zoho).

## Run it locally

```bash
pnpm install
cp .env.example .env          # then set BETTER_AUTH_SECRET: openssl rand -base64 32
docker compose up -d          # Postgres on localhost:5434
pnpm db:migrate               # create the tables
pnpm db:seed                  # optional: the sample event, "RYNOX"
pnpm dev                      # http://localhost:3000
```

Nothing else is needed to try the whole flow:

- `ALLOW_DEV_LOGIN="true"` adds a "sign in without Google" box (development only).
- With no Razorpay keys, the Pay button simulates a successful payment (development only).
- `EMAIL_PROVIDER="console"` prints emails to the server log instead of sending them.

**The first account to sign in becomes an admin.** Add more from Admin → Users, or list emails
in `ADMIN_EMAILS`. The dashboard is at `/admin`.

## Going live

| What | Where to get it | Env vars |
|---|---|---|
| Database | Neon project → pooled connection string | `DATABASE_URL` |
| Google sign-in | Google Cloud Console → Credentials → OAuth client (Web). Redirect URI `https://YOUR_DOMAIN/api/auth/callback/google` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Auth | `openssl rand -base64 32` | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` |
| Payments | Razorpay Dashboard → API keys | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` |
| Payment webhook | Razorpay Dashboard → Webhooks. URL `https://YOUR_DOMAIN/api/razorpay/webhook`, events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed` | `RAZORPAY_WEBHOOK_SECRET` |
| Email | Resend API key, **or** Zoho SMTP (`smtp.zoho.in`, port 465, app password) | `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY` or `SMTP_*` |
| Google Sheets sync (optional) | Google Cloud Console → enable **Google Sheets API** → create a **service account** → Keys → add a JSON key. Use its `client_email` and `private_key` | `GOOGLE_SHEETS_CLIENT_EMAIL`, `GOOGLE_SHEETS_PRIVATE_KEY` |
| Image uploads (optional) | Vercel → Storage → Blob | `BLOB_READ_WRITE_TOKEN` |

Deploy on Vercel, set the variables above, and run `pnpm db:migrate` against the production
database (locally with the Neon URL, or as part of the build command:
`pnpm db:migrate && pnpm build`). Leave `ALLOW_DEV_LOGIN` unset; it is ignored in production anyway.

Set up the webhook. It is what confirms a payment if the buyer closes the tab before returning
to the site.

## How it works

- **No overselling.** Creating an order locks the event row, counts valid tickets plus unexpired
  holds, and reserves seats for 15 minutes. Expired holds simply stop counting.
- **Payment confirmation.** The checkout callback (HMAC-verified, then re-checked against the
  Razorpay API) and the webhook both call one idempotent `fulfillOrder`. A payment that arrives
  after the hold lapsed is honoured if seats remain, otherwise refunded automatically.
- **Offline registrations.** Each ticket type can have a separate offline price. From an event's
  Registrations tab, "Offline registration" records someone who paid in person: the seat comes
  out of the same capacity and their QR ticket is emailed at once. Cancelling such a ticket does
  not go through Razorpay; the organiser returns the money by hand.
- **Competitions and levels.** An event holds one or more competitions, and each competition can
  have ordered levels. One competition with several levels is a level-wise event (qualify from
  each level to reach the next); several competitions are entered separately; each of those can
  have its own levels. Ticket types are assigned to a competition, and organisers move entrants
  from level to level under "Levels & results".
- **Ticket PDFs** are built from [pdfcn](https://pdfcn.dev) components (`src/components/pdf`) on
  the Takumi engine, using the fonts in `assets/fonts`.
- **Home page event.** The home page leads with one event: its photo behind the hero and a card
  beside the headline. By default that is the next upcoming event. An admin can choose a
  different one with "Show on home page" (Admin → Events, or the event's header); if the chosen
  event is unpublished or over, the page falls back to the next upcoming one.
- **AI access (MCP).** `/api/mcp` is a Model Context Protocol server, so an AI assistant can
  build events from a description instead of the forms. An admin creates an access token under
  Admin → AI access and adds the server to their assistant (the page shows the command for Claude
  Code and the JSON for Cursor, VS Code and others). Tools: list and read events, list section
  types, create a complete event in one call, update details, add or update competitions, ticket
  types, questions and sponsorship levels, replace the landing page, and change status. Events are
  created as drafts. The tools cannot delete events, refund payments or change registrations.
  Tokens are stored hashed, can be revoked, and stop working if their owner loses admin access.
- **Sponsorship.** Each event has sponsorship levels (name, amount or "on request", number of
  places, benefits). A brand sends a request from `/events/<slug>/sponsor`; nothing is public until
  an organiser approves it under the Sponsors tab. Approved sponsors appear in a Sponsors section
  on the event page, and those at levels marked "show in the hero" are also named in the hero.
  No payment is taken online: the organiser settles it directly and ticks "Payment received".
- **Google Sheets sync.** On an event's Registrations tab, link a Google Sheet (shared with the
  service account as Editor) and press "Sync to Google Sheets". It rewrites a tab named
  "Registrations" with the same columns as the CSV export, as plain text, and leaves every other
  tab alone. It runs when you press the button, not automatically.
- **Tickets.** Each ticket has a readable ID (`TKT-XXXXXXXX`) and an unguessable QR token. Only the
  owner and admins can view or download it.
- **Check-in.** One atomic update, so two scanners can never both admit the same ticket.
- **Landing pages.** Every event has its own page at `/events/<slug>` (the slug is the "Page
  address" field). It is a hero plus an ordered list of sections stored as JSON and validated per
  type: cards, countdown, text, stats, highlights, feature, steps, schedule, prizes, tickets,
  gallery, testimonials, FAQ, sponsors, video/map and call to action. Section types live in `src/sections/registry.ts` (schema, defaults,
  editor fields) and `src/sections/render.tsx` (how each one looks).

## Project layout

```
src/app/(site)      public and attendee pages
src/app/admin       organiser dashboard
src/app/actions     server actions (registration, admin)
src/app/api         auth, Razorpay webhook, CSV export, image upload
src/server          business logic: orders, payments, refunds, emails, tickets
src/server/mcp      the MCP server: protocol, tools, access tokens
src/sections        landing-page section types
src/components/motion  scroll and entrance animations (Motion reveals, GSAP parallax, marquee, count-up)
src/components/ui   shadcn/ui components (every control in the app is built from these)
src/db              Drizzle schema, client, seed
drizzle/            SQL migrations
tests/              Vitest suite and browser smoke tests
```

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Develop, build, serve |
| `pnpm test` | Vitest suite against a separate `events_test` database in the local container |
| `tests/load/run.sh [gate\|busy\|heavy\|extreme]` | Load test of the entrance: athletes opening tickets while organisers scan, against a production build on its own port and database |
| `pnpm lint` / `pnpm typecheck` | ESLint, TypeScript |
| `pnpm db:generate` | Create a migration after editing `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Browse the database |
| `tests/e2e/run.sh` | Browser tests (attendee and admin flows) on their own database and port, so your dev data and dev server are untouched |
