import "server-only";

const isProd = process.env.NODE_ENV === "production";

export const env = {
  appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  siteName: process.env.NEXT_PUBLIC_SITE_NAME ?? "RYNOX",
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  emailProvider: (process.env.EMAIL_PROVIDER ?? "console") as "resend" | "smtp" | "console",
  emailFrom: process.env.EMAIL_FROM ?? "Tickets <tickets@example.com>",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 465),
    user: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
  },
  blobToken: process.env.BLOB_READ_WRITE_TOKEN ?? "",
  sheetsClientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL ?? "",
  // Stored on one line with \n escapes in most env editors.
  sheetsPrivateKey: (process.env.GOOGLE_SHEETS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
};

export const googleConfigured = Boolean(env.googleClientId && env.googleClientSecret);
export const sheetsConfigured = Boolean(env.sheetsClientEmail && env.sheetsPrivateKey);
export const razorpayConfigured = Boolean(env.razorpayKeyId && env.razorpayKeySecret);

/**
 * Development conveniences. Both are hard-disabled in production builds.
 * - mockPayments: with no Razorpay keys, orders can be paid with a "simulate" button.
 * - devLogin: with ALLOW_DEV_LOGIN=true, sign in with any email (no Google needed).
 */
export const mockPayments = !isProd && !razorpayConfigured;
export const devLogin = !isProd && process.env.ALLOW_DEV_LOGIN === "true";

export function isAdminEmail(email: string) {
  return env.adminEmails.includes(email.toLowerCase());
}
