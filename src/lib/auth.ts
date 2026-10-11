import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { count } from "drizzle-orm";
import { db, schema } from "@/db";
import { devLogin, env, googleConfigured, isAdminEmail } from "./env";
import { lanAddresses } from "./lan";

// In development the site can also be opened by IP address from another device
// on the same network, so sign-in has to accept that address too.
const devOrigins =
  process.env.NODE_ENV === "production"
    ? []
    : lanAddresses().map((ip) => `http://${ip}:${process.env.PORT ?? 3000}`);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? env.appUrl,
  trustedOrigins: devOrigins,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: env.googleClientId,
          clientSecret: env.googleClientSecret,
          prompt: "select_account",
        },
      }
    : {},
  // Only used by the development login; never enabled in production.
  emailAndPassword: { enabled: devLogin, minPasswordLength: 8 },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "USER", input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // The very first account becomes the admin, so a fresh install can be
          // set up without touching the environment. ADMIN_EMAILS also applies.
          const [{ n }] = await db.select({ n: count() }).from(schema.user);
          const isAdmin = n === 0 || isAdminEmail(user.email);
          return { data: { ...user, role: isAdmin ? "ADMIN" : "USER" } };
        },
      },
    },
  },
  plugins: [nextCookies()],
});
