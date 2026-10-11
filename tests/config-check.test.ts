import { describe, expect, it } from "vitest";
import { checkConfig } from "@/lib/config-check";

const state = (env: Record<string, string>) =>
  Object.fromEntries(checkConfig(env).map((c) => [c.name, c.state]));

const live = {
  NEXT_PUBLIC_APP_URL: "https://events.example.org",
  DATABASE_URL: "postgresql://u:p@ep-x-pooler.ap-south-1.aws.neon.tech/db",
  BETTER_AUTH_SECRET: "x".repeat(44),
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  RAZORPAY_KEY_ID: "rzp_live_abc",
  RAZORPAY_KEY_SECRET: "secret",
  RAZORPAY_WEBHOOK_SECRET: "whsec",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_x",
  EMAIL_FROM: "Tickets <tickets@events.example.org>",
};

describe("checkConfig", () => {
  it("reports a fully configured site as ready, with only the optional extras flagged", () => {
    const s = state(live);
    expect(Object.entries(s).filter(([, v]) => v === "missing")).toEqual([]);
    expect(s["Razorpay payments"]).toBe("ok");
    expect(s["Image uploads"]).toBe("warning");
  });

  it("flags an empty environment and common go-live mistakes", () => {
    const empty = state({});
    for (const name of ["Site address", "Database", "Sign-in secret", "Google sign-in", "Razorpay payments", "Razorpay webhook", "Email"]) {
      expect(empty[name]).toBe("missing");
    }
    expect(state({ ...live, RAZORPAY_KEY_ID: "rzp_test_abc" })["Razorpay payments"]).toBe("warning");
    expect(state({ ...live, DATABASE_URL: "postgresql://u:p@ep-x.ap-south-1.aws.neon.tech/db" }).Database).toBe("warning");
    expect(state({ ...live, EMAIL_FROM: "Tickets <tickets@example.com>" }).Email).toBe("warning");
    expect(state({ ...live, EMAIL_PROVIDER: "smtp" }).Email).toBe("missing");
    expect(state({ ...live, BETTER_AUTH_SECRET: "short" })["Sign-in secret"]).toBe("missing");
  });

  it("never includes a secret's value in what it reports", () => {
    const text = JSON.stringify(checkConfig({ ...live, RAZORPAY_KEY_SECRET: "TOP-SECRET-1", BETTER_AUTH_SECRET: "S".repeat(40) }));
    expect(text).not.toContain("TOP-SECRET-1");
    expect(text).not.toContain("S".repeat(40));
  });
});
