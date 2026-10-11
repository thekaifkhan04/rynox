"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { offlineRegisterAction } from "@/app/actions/admin";
import { registerAction } from "@/app/actions/registration";
import { SimpleSelect } from "@/components/simple-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormField } from "@/db/schema";
import { formatAmount, formatPaise } from "@/lib/money";

type TypeOption = {
  id: string;
  name: string;
  description: string | null;
  pricePaise: number;
  /** Seats left; null means unlimited. */
  left: number | null;
};

type Attendee = {
  key: number;
  ticketTypeId: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  answers: Record<string, string | boolean>;
};

export function RegistrationForm({
  event,
  types,
  fields,
  defaultTypeId,
  user,
  offline,
}: {
  event: { id: string; maxTicketsPerOrder: number };
  types: TypeOption[];
  fields: FormField[];
  defaultTypeId: string;
  user: { name: string; email: string };
  /** Organiser entering a paid-in-person registration; redirects to this URL when done. */
  offline?: { doneHref: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nextKey, setNextKey] = useState(1);
  const blank = (key: number, prefill = false): Attendee => ({
    key,
    ticketTypeId: defaultTypeId,
    name: prefill ? user.name : "",
    email: prefill ? user.email : "",
    phone: "",
    organization: "",
    answers: {},
  });
  const [attendees, setAttendees] = useState<Attendee[]>([blank(0, !offline)]);

  const typeById = new Map(types.map((t) => [t.id, t]));
  const total = attendees.reduce((s, a) => s + (typeById.get(a.ticketTypeId)?.pricePaise ?? 0), 0);
  const counts = new Map<string, number>();
  for (const a of attendees) counts.set(a.ticketTypeId, (counts.get(a.ticketTypeId) ?? 0) + 1);
  const overbooked = types.find((t) => t.left != null && (counts.get(t.id) ?? 0) > t.left);
  const multiple = event.maxTicketsPerOrder > 1;

  function update(key: number, patch: Partial<Attendee>) {
    setAttendees((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }
  function setAnswer(key: number, field: string, value: string | boolean) {
    setAttendees((list) =>
      list.map((a) => (a.key === key ? { ...a, answers: { ...a.answers, [field]: value } } : a)),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // The browser checks required text boxes itself, but it cannot point at a
    // dropdown, so a required one left empty is caught here and focused.
    for (const [index, a] of attendees.entries()) {
      const missing = fields.find((f) => f.type === "SELECT" && f.required && !a.answers[f.key]);
      if (missing) {
        const message = `${multiple ? `Athlete ${index + 1}: ` : ""}Please choose an option for “${missing.label}”.`;
        setError(message);
        toast.error(message);
        document.getElementById(`a${a.key}-${missing.key}`)?.focus();
        return;
      }
    }
    startTransition(async () => {
      const res = await (offline ? offlineRegisterAction : registerAction)({
        eventId: event.id,
        attendees: attendees.map((a) => ({
          ticketTypeId: a.ticketTypeId,
          name: a.name,
          email: a.email,
          phone: a.phone,
          organization: a.organization,
          answers: a.answers,
        })),
      });
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      if (offline) toast.success("Registered. The ticket has been emailed to the attendee.");
      router.push(offline?.doneHref ?? `/orders/${res.orderId}`);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        {attendees.map((a, index) => {
          const id = (name: string) => `a${a.key}-${name}`;
          return (
            <Card key={a.key} className="rounded-none">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="display text-xl">
                  {multiple ? `Athlete ${index + 1}` : "Your details"}
                </CardTitle>
                {attendees.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAttendees((l) => l.filter((x) => x.key !== a.key))}
                  >
                    <Trash2 /> Remove
                  </Button>
                )}
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={id("type")}>Category</Label>
                  <SimpleSelect
                    id={id("type")}
                    value={a.ticketTypeId}
                    onValueChange={(ticketTypeId) => update(a.key, { ticketTypeId })}
                    options={types.map((t) => ({
                      value: t.id,
                      label: `${t.name} — ${formatPaise(t.pricePaise)}${t.left === 0 ? " (sold out)" : ""}`,
                      disabled: t.left === 0,
                    }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={id("name")}>Full name</Label>
                  <Input
                    id={id("name")}
                    required
                    minLength={2}
                    autoComplete={index === 0 ? "name" : "off"}
                    value={a.name}
                    onChange={(e) => update(a.key, { name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={id("email")}>Email</Label>
                  <Input
                    id={id("email")}
                    type="email"
                    required
                    autoComplete={index === 0 ? "email" : "off"}
                    value={a.email}
                    onChange={(e) => update(a.key, { email: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={id("phone")}>Phone number</Label>
                  <Input
                    id={id("phone")}
                    type="tel"
                    required
                    inputMode="tel"
                    autoComplete={index === 0 ? "tel" : "off"}
                    placeholder="+91 98765 43210"
                    value={a.phone}
                    onChange={(e) => update(a.key, { phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={id("org")}>College / Company / Club</Label>
                  <Input
                    id={id("org")}
                    autoComplete={index === 0 ? "organization" : "off"}
                    value={a.organization}
                    onChange={(e) => update(a.key, { organization: e.target.value })}
                  />
                </div>

                {fields.map((f) => {
                  const fid = id(f.key);
                  const value = a.answers[f.key];
                  if (f.type === "CHECKBOX") {
                    return (
                      <div key={f.id} className="flex items-start gap-3 sm:col-span-2">
                        <Checkbox
                          id={fid}
                          checked={value === true}
                          required={f.required}
                          onCheckedChange={(v) => setAnswer(a.key, f.key, v === true)}
                          className="mt-0.5"
                        />
                        <Label htmlFor={fid} className="leading-snug font-normal">
                          {f.label}
                          {f.required && <span className="text-(--event-accent)"> *</span>}
                        </Label>
                      </div>
                    );
                  }
                  const common = {
                    id: fid,
                    required: f.required,
                    value: typeof value === "string" ? value : "",
                    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                      setAnswer(a.key, f.key, e.target.value),
                  };
                  return (
                    <div
                      key={f.id}
                      className={`space-y-1.5 ${f.type === "TEXTAREA" ? "sm:col-span-2" : ""}`}
                    >
                      <Label htmlFor={fid}>
                        {f.label}
                        {!f.required && <span className="text-white/50"> (optional)</span>}
                      </Label>
                      {f.type === "TEXTAREA" ? (
                        <Textarea {...common} rows={3} />
                      ) : f.type === "SELECT" ? (
                        <SimpleSelect
                          id={fid}
                          placeholder="Select…"
                          value={common.value}
                          onValueChange={(v) => setAnswer(a.key, f.key, v)}
                          options={f.options.map((o) => ({ value: o, label: o }))}
                        />
                      ) : (
                        <Input {...common} type={f.type === "NUMBER" ? "number" : "text"} />
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}

        {multiple && attendees.length < event.maxTicketsPerOrder && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setAttendees((l) => [...l, blank(nextKey)]);
              setNextKey((k) => k + 1);
            }}
          >
            <Plus /> Add another ticket
          </Button>
        )}
      </div>

      <Card className="h-fit rounded-none lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle className="display text-xl">Order summary</CardTitle>
        </CardHeader>
        <CardContent>
        <ul className="space-y-2 text-sm">
          {attendees.map((a, i) => {
            const t = typeById.get(a.ticketTypeId);
            return (
              <li key={a.key} className="flex justify-between gap-4">
                <span className="text-white/80">
                  {t?.name}
                  {multiple && <span className="text-white/50"> · Athlete {i + 1}</span>}
                </span>
                <span className="font-semibold">{formatPaise(t?.pricePaise ?? 0)}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex justify-between border-t border-white/15 pt-4 text-lg font-bold">
          <span>Total</span>
          <span>{formatAmount(total)}</span>
        </div>
        {(overbooked || error) && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>
              {overbooked ? `Only ${overbooked.left} left for ${overbooked.name}.` : error}
            </AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          variant="accent"
          size="xl"
          disabled={pending || Boolean(overbooked)}
          className="mt-5 h-12 w-full"
        >
          {offline
            ? pending
              ? "Registering…"
              : `Confirm ${formatAmount(total)} received`
            : pending
              ? "Reserving…"
              : total === 0
                ? "Complete registration"
                : "Continue to payment"}
        </Button>
        <p className="mt-3 text-xs text-white/50">
          {offline
            ? "Only confirm once you have collected the money. Tickets are issued and emailed immediately."
            : total === 0
              ? "Your ticket is issued straight away."
              : "Your seats are held for 15 minutes while you pay."}
        </p>
        </CardContent>
      </Card>
    </form>
  );
}
