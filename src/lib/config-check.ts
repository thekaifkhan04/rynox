/**
 * Checks the settings the site needs to run for real. Used at server start
 * (to log what is missing) and on the admin dashboard (to show it).
 * It reads names and shapes only and never returns a secret's value.
 */
export type ConfigCheck = {
  name: string;
  /** ok = ready; missing = the feature will not work; warning = works, but worth a look. */
  state: "ok" | "missing" | "warning";
  detail: string;
};

type Env = Record<string, string | undefined>;

export function checkConfig(e: Env = process.env): ConfigCheck[] {
  const has = (k: string) => Boolean(e[k]?.trim());
  const url = e.NEXT_PUBLIC_APP_URL ?? "";
  const local = !url || /localhost|127\.0\.0\.1/.test(url);
  const provider = e.EMAIL_PROVIDER ?? "console";
  const smtpReady = has("SMTP_HOST") && has("SMTP_USER") && has("SMTP_PASSWORD");
  const emailReady = provider === "resend" ? has("RESEND_API_KEY") : provider === "smtp" ? smtpReady : false;
  const sheets = has("GOOGLE_SHEETS_CLIENT_EMAIL") && has("GOOGLE_SHEETS_PRIVATE_KEY");

  return [
    {
      name: "Site address",
      state: local ? "missing" : url.startsWith("https://") ? "ok" : "warning",
      detail: local
        ? "NEXT_PUBLIC_APP_URL and BETTER_AUTH_URL still point at localhost. Links in emails and sign-in will be wrong."
        : url.startsWith("https://")
          ? url
          : "The site address should start with https://",
    },
    {
      name: "Database",
      state: !has("DATABASE_URL") ? "missing" : /neon\.tech/.test(e.DATABASE_URL!) && !/-pooler/.test(e.DATABASE_URL!) ? "warning" : "ok",
      detail: !has("DATABASE_URL")
        ? "DATABASE_URL is not set."
        : /neon\.tech/.test(e.DATABASE_URL!) && !/-pooler/.test(e.DATABASE_URL!)
          ? "This is Neon's direct connection. Use the pooled one (host name with -pooler) so busy periods do not run out of connections."
          : "Set.",
    },
    {
      name: "Sign-in secret",
      state: (e.BETTER_AUTH_SECRET?.length ?? 0) >= 32 ? "ok" : "missing",
      detail:
        (e.BETTER_AUTH_SECRET?.length ?? 0) >= 32
          ? "Set."
          : "BETTER_AUTH_SECRET is missing or too short. Generate one with: openssl rand -base64 32",
    },
    {
      name: "Google sign-in",
      state: has("GOOGLE_CLIENT_ID") && has("GOOGLE_CLIENT_SECRET") ? "ok" : "missing",
      detail:
        has("GOOGLE_CLIENT_ID") && has("GOOGLE_CLIENT_SECRET")
          ? "Set. The redirect address in Google Cloud must be <site address>/api/auth/callback/google."
          : "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set, so nobody can sign in.",
    },
    {
      name: "Razorpay payments",
      state: !(has("RAZORPAY_KEY_ID") && has("RAZORPAY_KEY_SECRET"))
        ? "missing"
        : e.RAZORPAY_KEY_ID!.startsWith("rzp_test_")
          ? "warning"
          : "ok",
      detail: !(has("RAZORPAY_KEY_ID") && has("RAZORPAY_KEY_SECRET"))
        ? "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set, so paid tickets cannot be bought."
        : e.RAZORPAY_KEY_ID!.startsWith("rzp_test_")
          ? "Using test keys: no real money moves. Switch to live keys to take payments."
          : "Live keys set.",
    },
    {
      name: "Razorpay webhook",
      state: has("RAZORPAY_WEBHOOK_SECRET") ? "ok" : "missing",
      detail: has("RAZORPAY_WEBHOOK_SECRET")
        ? "Secret set. The webhook in Razorpay must point at <site address>/api/razorpay/webhook."
        : "RAZORPAY_WEBHOOK_SECRET is not set. Without the webhook, a buyer who closes the tab after paying gets no ticket.",
    },
    {
      name: "Email",
      state: !emailReady ? "missing" : /example\.com/.test(e.EMAIL_FROM ?? "example.com") ? "warning" : "ok",
      detail: !emailReady
        ? provider === "console"
          ? "EMAIL_PROVIDER is \"console\", so tickets are written to the server log instead of being emailed."
          : `EMAIL_PROVIDER is "${provider}" but its credentials are incomplete.`
        : /example\.com/.test(e.EMAIL_FROM ?? "example.com")
          ? "EMAIL_FROM still uses example.com. Set it to an address on your own verified domain."
          : `Sending through ${provider === "resend" ? "Resend" : "SMTP"}.`,
    },
    {
      name: "Image uploads",
      state: has("BLOB_READ_WRITE_TOKEN") ? "ok" : "warning",
      detail: has("BLOB_READ_WRITE_TOKEN")
        ? "Set."
        : "Optional. Without BLOB_READ_WRITE_TOKEN, images are added by pasting a link.",
    },
    {
      name: "Google Sheets sync",
      state: sheets ? "ok" : "warning",
      detail: sheets ? "Set." : "Optional. Not configured, so the sync button is unavailable; CSV export still works.",
    },
  ];
}
