import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { resetDb } from "./helpers";

beforeEach(resetDb);

it("makes the first account an admin and later accounts regular users", async () => {
  process.env.ALLOW_DEV_LOGIN = "true";
  process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret";
  const { auth } = await import("@/lib/auth");
  const signUp = (email: string) =>
    auth.api.signUpEmail({ body: { email, password: "password-123", name: email } });

  await signUp("first@test.dev");
  await signUp("second@test.dev");

  const role = async (email: string) =>
    (await db.select().from(user).where(eq(user.email, email)))[0].role;
  expect(await role("first@test.dev")).toBe("ADMIN");
  expect(await role("second@test.dev")).toBe("USER");
});
