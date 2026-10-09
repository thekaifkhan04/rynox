"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

const DEV_PASSWORD = "dev-login-only";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5!">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.300H12v4.400h6.500a5.600 5.600 0 0 1-2.400 3.600v3h3.900c2.300-2.100 3.500-5.200 3.500-8.700Z" />
      <path fill="#34A853" d="M12 24c3.200 0 6-1.100 8-2.900l-3.900-3c-1.100.7-2.500 1.200-4.100 1.200-3.100 0-5.800-2.100-6.700-5H1.300v3.100A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.300 14.300a7.200 7.200 0 0 1 0-4.600V6.600H1.300a12 12 0 0 0 0 10.800l4-3.100Z" />
      <path fill="#EA4335" d="M12 4.800c1.800 0 3.300.6 4.600 1.800l3.400-3.400A12 12 0 0 0 1.300 6.600l4 3.100c.9-2.900 3.600-4.900 6.700-4.900Z" />
    </svg>
  );
}

export function SignInForm({
  next,
  google,
  devLogin,
}: {
  next: string;
  google: boolean;
  devLogin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"google" | "dev" | null>(null);
  const [email, setEmail] = useState("");

  async function withGoogle() {
    setBusy("google");
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: next });
    if (error) {
      toast.error(error.message ?? "Could not start Google sign-in");
      setBusy(null);
    }
  }

  async function withDevLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy("dev");
    const name = email.split("@")[0] || "Dev User";
    let { error } = await authClient.signIn.email({ email, password: DEV_PASSWORD });
    if (error) ({ error } = await authClient.signUp.email({ email, password: DEV_PASSWORD, name }));
    if (error) {
      toast.error(error.message ?? "Dev login failed");
      setBusy(null);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {google ? (
        <Button
          size="2xl"
          className="w-full gap-3 shadow-[0_10px_40px_-12px_rgba(255,255,255,0.45)]"
          onClick={withGoogle}
          disabled={busy !== null}
        >
          {busy === "google" ? <LoaderCircle className="animate-spin" /> : <GoogleMark />}
          {busy === "google" ? "Opening Google…" : "Continue with Google"}
        </Button>
      ) : (
        <Alert>
          <AlertDescription>
            Google sign-in is not configured yet. Set <code>GOOGLE_CLIENT_ID</code> and{" "}
            <code>GOOGLE_CLIENT_SECRET</code> in the environment.
          </AlertDescription>
        </Alert>
      )}

      {devLogin && (
        <>
          <div className="flex items-center gap-3">
            <Separator className="shrink" />
            <span className="shrink-0 text-xs font-semibold tracking-[0.2em] text-amber-300 uppercase">
              Development login
            </span>
            <Separator className="shrink" />
          </div>
          <form onSubmit={withDevLogin} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="dev-email">Email</Label>
              <Input
                id="dev-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11"
              />
            </div>
            <Button type="submit" variant="outline" className="h-11 w-full" disabled={busy !== null}>
              {busy === "dev" && <LoaderCircle className="animate-spin" />}
              Sign in without Google
            </Button>
            <p className="text-xs text-white/45">
              Only available while developing. It is switched off in production.
            </p>
          </form>
        </>
      )}
    </div>
  );
}
