import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

/** Derive a separate `<db>_test` database from DATABASE_URL and migrate it. */
export function testDatabaseUrl() {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname.replace(/_test$/, "")}_test`;
  return url.toString();
}

export default async function setup() {
  const testUrl = testDatabaseUrl();
  const dbName = new URL(testUrl).pathname.slice(1);

  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const client = new Client({ connectionString: testUrl });
  await client.connect();
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  await client.end();
}
