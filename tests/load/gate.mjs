// Gate-rush load test: athletes opening tickets while admins scan, at the same time.
import { execSync } from "node:child_process";
import fs from "node:fs";
import autocannon from "autocannon";

const d = JSON.parse(fs.readFileSync(process.env.LOAD_DATA, "utf8"));

const BASE = process.env.BASE_URL;
const PORT = new URL(BASE).port;
const DB = process.env.LOAD_DB;
// The scanner posts to a server action; its id is read from the build by run.sh.
const ACTION = process.env.SCAN_ACTION;
let nextToken = Number(process.env.TOKEN_OFFSET ?? 0);

function run(opts) {
  return new Promise((resolve, reject) => autocannon({ url: BASE, timeout: 20, ...opts }, (e, r) => (e ? reject(e) : resolve(r))));
}
const pick = () => d.athletes[Math.floor(Math.random() * d.athletes.length)];
const fmt = (r) =>
  `${String(Math.round(r.requests.average)).padStart(5)} req/s | latency ms: median ${r.latency.p50}, p97.5 ${r.latency.p97_5}, p99 ${r.latency.p99}, max ${r.latency.max} | ` +
  `sent ${r.requests.total}, 2xx ${r["2xx"]}, non-2xx ${r.non2xx}, errors ${r.errors}, timeouts ${r.timeouts}`;

async function stage(name, { seconds, athletes, athleteRate, scanners, scanRate, pdfShare = 0.05 }) {
  const counts = { ticketOk: 0, ticketBad: 0, listOk: 0, pdfOk: 0, scans: {}, scanSent: 0 };
  const startToken = nextToken;

  const viewers = run({
    connections: athletes,
    duration: seconds,
    ...(athleteRate ? { overallRate: athleteRate } : {}),
    requests: [
      {
        // What an athlete does at the gate: open their ticket (mostly), their ticket list, or the PDF.
        setupRequest: (req, ctx) => {
          const a = pick();
          const roll = Math.random();
          ctx.kind = roll < pdfShare ? "pdf" : roll < pdfShare + 0.2 ? "list" : "ticket";
          ctx.code = a.code;
          req.method = "GET";
          req.path = ctx.kind === "pdf" ? `/tickets/${a.code}/pdf` : ctx.kind === "list" ? "/tickets" : `/tickets/${a.code}`;
          req.headers = { cookie: a.cookie };
          return req;
        },
        onResponse: (status, body, ctx) => {
          if (ctx.kind === "ticket") {
            // A correct page shows this athlete's own QR code.
            if (status === 200 && body.includes("QR code for ticket " + ctx.code)) counts.ticketOk++;
            else counts.ticketBad++;
          }
          else if (ctx.kind === "list" && status === 200) counts.listOk++;
          else if (ctx.kind === "pdf" && status === 200) counts.pdfOk++;
        },
      },
    ],
  });

  const scans = run({
    connections: scanners,
    duration: seconds,
    ...(scanRate ? { overallRate: scanRate } : {}),
    requests: [
      {
        // A scanner posting the QR token, exactly as the check-in screen does. Every scan is a fresh ticket.
        setupRequest: (req) => {
          const token = d.tokens[nextToken++ % d.tokens.length];
          counts.scanSent++;
          req.method = "POST";
          req.path = `/admin/events/${d.eventId}/check-in`;
          req.headers = { cookie: d.adminCookie, "Next-Action": ACTION, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" };
          req.body = JSON.stringify([d.eventId, token]);
          return req;
        },
        onResponse: (status, body) => {
          const m = body.match(/"result":"([a-z_]+)"/);
          const key = status !== 200 ? `http_${status}` : m ? m[1] : "unparsed";
          counts.scans[key] = (counts.scans[key] ?? 0) + 1;
        },
      },
    ],
  });

  const pid = execSync(`ss -ltnp 2>/dev/null | grep ':${PORT} ' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2`).toString().trim();
  const ticks = () => { const f = fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" "); return Number(f[11]) + Number(f[12]); };
  const t0 = ticks(), w0 = Date.now();
  const [v, s] = await Promise.all([viewers, scans]);
  const cores = (ticks() - t0) / 100 / ((Date.now() - w0) / 1000);
  const rssMb = Math.round(Number(fs.readFileSync(`/proc/${pid}/statm`, "utf8").split(" ")[1]) * 4096 / 1048576);

  const inDb = Number(
    execSync(
      `docker compose exec -T db psql -U events -d ${DB} -tAc "select count(*) from tickets where checked_in_at is not null"`,
    ).toString().trim(),
  );
  console.log(`\n=== ${name} (${seconds}s: ${athletes} athlete connections${athleteRate ? ` capped at ${athleteRate}/s` : ", unthrottled"}; ${scanners} scanners${scanRate ? ` capped at ${scanRate}/s` : ", unthrottled"}) ===`);
  console.log("athletes:", fmt(v));
  console.log(`          ticket pages correct ${counts.ticketOk}, wrong/failed ${counts.ticketBad}; ticket lists ok ${counts.listOk}; PDFs ok ${counts.pdfOk}`);
  console.log("scanners:", fmt(s));
  console.log("          outcomes", JSON.stringify(counts.scans), `| distinct tickets sent ${nextToken - startToken}`);
  console.log(`database: ${inDb} tickets checked in so far`);
  console.log(`server:   ${cores.toFixed(2)} CPU cores used on average, ${rssMb} MB memory`);
  return { v, s, counts, inDb };
}

(async () => {
  const which = process.argv[2] ?? "gate";
  if (which === "gate") {
    // A large event's worst ten minutes: 5,000 athletes arriving, each opening their ticket about twice,
    // with 8 organisers scanning as fast as a person can (one scan every ~2 seconds each).
    await stage("Large event gate rush", { seconds: 60, athletes: 60, athleteRate: 17, scanners: 8, scanRate: 4 });
  } else if (which === "busy") {
    await stage("Ten times a realistic gate", { seconds: 30, athletes: 40, athleteRate: 30, scanners: 8, scanRate: 10 });
  } else if (which === "heavy") {
    await stage("Heavy: everyone refreshing at once", { seconds: 30, athletes: 150, scanners: 12 });
  } else if (which === "extreme") {
    await stage("Extreme: far beyond a real gate", { seconds: 30, athletes: 400, scanners: 30 });
  } else {
    console.error("Unknown stage. Use: gate, busy, heavy or extreme.");
    process.exit(1);
  }
})();
