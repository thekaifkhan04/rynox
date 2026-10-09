import { checkConfig } from "@/lib/config-check";

/** Runs once when a server starts. In production, say plainly what is not configured. */
export function register() {
  if (process.env.NODE_ENV !== "production") return;
  const missing = checkConfig().filter((c) => c.state === "missing");
  for (const c of missing) console.error(`[config] ${c.name}: ${c.detail}`);
  if (missing.length) {
    console.error(`[config] ${missing.length} required setting(s) missing. See Admin > Dashboard > Setup.`);
  }
}
