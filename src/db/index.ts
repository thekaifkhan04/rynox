import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

/**
 * One connection pool per server process. It is kept on `globalThis` because
 * the app is bundled into several chunks, and each would otherwise open its
 * own pool (and in development, a new one on every hot reload).
 *
 * On serverless hosting every running instance has its own pool, so keep
 * DATABASE_POOL_MAX small there and use the provider's pooled connection
 * string (for Neon, the host name containing "-pooler").
 */
const pool = (globalForDb.pgPool ??= new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_MAX) || 10,
  // Fail a request rather than hang forever when the database cannot be reached.
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
}));

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
