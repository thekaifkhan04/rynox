"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { scanTicketAction, type CheckInResponse } from "@/app/actions/admin";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The scanner needs the camera API, so it only loads in the browser.
const Scanner = dynamic(() => import("@yudiel/react-qr-scanner").then((m) => m.Scanner), {
  ssr: false,
  loading: () => <div className="flex aspect-square items-center justify-center text-sm text-white/50">Starting camera…</div>,
});

type Outcome = { tone: "ok" | "warn" | "bad"; title: string; detail?: string; at: number };

function describe(res: CheckInResponse, timezone: string): Omit<Outcome, "at"> {
  const who = res.ticket ? `${res.ticket.name} · ${res.ticket.type} · ${res.ticket.code}` : undefined;
  switch (res.result) {
    case "checked_in":
      return { tone: "ok", title: "Checked in", detail: who };
    case "already_checked_in":
      return {
        tone: "warn",
        title: "Already checked in",
        detail: `${who} · at ${new Date(res.at).toLocaleTimeString("en-IN", { timeZone: timezone, hour: "numeric", minute: "2-digit" })}`,
      };
    case "cancelled":
      return { tone: "bad", title: "Ticket cancelled", detail: who };
    case "not_paid":
      return { tone: "bad", title: "Not paid", detail: who };
    case "wrong_event":
      return { tone: "bad", title: "Ticket is for a different event", detail: who };
    default:
      return { tone: "bad", title: "Ticket not found" };
  }
}

const tones = {
  ok: { box: "border-emerald-400/60 bg-emerald-400/15 text-emerald-100", Icon: CircleCheck },
  warn: { box: "border-amber-400/60 bg-amber-400/15 text-amber-100", Icon: CircleAlert },
  bad: { box: "border-red-400/60 bg-red-400/15 text-red-100", Icon: CircleX },
};

export function CheckInScanner({
  eventId,
  timezone,
  initial,
}: {
  eventId: string;
  timezone: string;
  initial: { sold: number; checkedIn: number };
}) {
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [history, setHistory] = useState<Outcome[]>([]);
  const [checkedIn, setCheckedIn] = useState(initial.checkedIn);
  const [code, setCode] = useState("");
  const busy = useRef(false);
  const last = useRef({ value: "", at: 0 });

  const submit = useCallback(
    async (value: string) => {
      const now = Date.now();
      // Ignore the same code held in front of the camera, and overlapping requests.
      if (busy.current || (last.current.value === value && now - last.current.at < 4000)) return;
      busy.current = true;
      last.current = { value, at: now };
      try {
        const res = await scanTicketAction(eventId, value);
        const next: Outcome = res.ok
          ? { ...describe(res.data, timezone), at: now }
          : { tone: "bad", title: res.error, at: now };
        if (res.ok && res.data.result === "checked_in") setCheckedIn((n) => n + 1);
        setOutcome(next);
        setHistory((h) => [next, ...h].slice(0, 8));
        navigator.vibrate?.(next.tone === "ok" ? 80 : [80, 60, 80]);
      } finally {
        busy.current = false;
      }
    },
    [eventId, timezone],
  );

  const tone = outcome ? tones[outcome.tone] : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_1fr]">
      <div className="space-y-4">
        <Card className="overflow-hidden py-0">
          {camera ? (
            <Scanner
              onScan={(codes) => codes[0]?.rawValue && submit(codes[0].rawValue)}
              onError={(err) => {
                setCameraError(
                  err instanceof Error && err.name === "NotAllowedError"
                    ? "Camera access was blocked. Allow it in the browser's site settings, or type the ticket code instead."
                    : "The camera could not be started. Type the ticket code instead.",
                );
                setCamera(false);
              }}
              formats={["qr_code"]}
              allowMultiple
              scanDelay={1200}
              sound={false}
              constraints={{ facingMode: "environment" }}
            />
          ) : (
            <div className="flex aspect-square flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="text-sm text-white/60">Point the camera at the QR code on a ticket.</p>
              <Button size="lg" onClick={() => { setCameraError(null); setCamera(true); }}>
                Start camera
              </Button>
            </div>
          )}
        </Card>
        {camera && (
          <Button variant="outline" onClick={() => setCamera(false)}>
            Stop camera
          </Button>
        )}
        {cameraError && (
          <Alert className="border-amber-400/40 text-amber-200">
            <AlertDescription className="text-amber-200">{cameraError}</AlertDescription>
          </Alert>
        )}

        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) {
              last.current = { value: "", at: 0 };
              submit(code.trim());
              setCode("");
            }
          }}
        >
          <Label htmlFor="manual-code">Or enter the ticket ID</Label>
          <div className="flex gap-2">
            <Input
              id="manual-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="TKT-XXXXXXXX"
              autoCapitalize="characters"
              autoComplete="off"
              className="font-mono uppercase"
            />
            <Button type="submit">Check in</Button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          <span className="text-2xl font-bold text-white tabular-nums">{checkedIn}</span> of{" "}
          {initial.sold} checked in
        </p>
        <div aria-live="assertive" className="min-h-28">
          {outcome && tone ? (
            <Alert className={`border-2 p-5 ${tone.box}`}>
              <tone.Icon className="size-7!" aria-hidden />
              <AlertTitle className="text-2xl font-bold">{outcome.title}</AlertTitle>
              {outcome.detail && (
                <AlertDescription className="text-base text-inherit">{outcome.detail}</AlertDescription>
              )}
            </Alert>
          ) : (
            <Alert className="border-dashed p-6">
              <AlertDescription>The result of each scan appears here.</AlertDescription>
            </Alert>
          )}
        </div>
        {history.length > 1 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold">Recent scans</h2>
            <ul className="space-y-1.5 text-sm">
              {history.slice(1).map((h) => (
                <li key={h.at} className="flex gap-2 text-white/70">
                  <span className={h.tone === "ok" ? "text-emerald-300" : h.tone === "warn" ? "text-amber-300" : "text-red-300"}>
                    {h.title}
                  </span>
                  <span className="truncate">{h.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
