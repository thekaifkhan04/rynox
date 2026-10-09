"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveEventAction } from "@/app/actions/admin";
import type { EventInput } from "@/server/event-admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageInput, UploadsContext } from "./image-input";
import { useAction } from "./use-action";

export const blankEvent: EventInput = {
  title: "",
  slug: "",
  tagline: "",
  summary: "",
  coverImageUrl: "",
  accentColor: "#ff4d1c",
  venueName: "",
  venueAddress: "",
  city: "",
  mapUrl: "",
  timezone: "Asia/Kolkata",
  startsAt: "",
  endsAt: "",
  registrationOpensAt: "",
  registrationClosesAt: "",
  capacity: "",
  maxTicketsPerOrder: 1,
};

function Field({
  label,
  htmlFor,
  help,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card role="group" aria-label={title}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

export function EventForm({
  id,
  initial,
  uploads,
}: {
  id: string | null;
  initial: EventInput;
  uploads: boolean;
}) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [v, setV] = useState(initial);
  const set = <K extends keyof EventInput>(key: K, value: EventInput[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));
  const text = (key: keyof EventInput) => ({
    id: key,
    value: String(v[key] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, e.target.value as never),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(() => saveEventAction(id, v), {
      success: id ? "Event saved" : "Event created",
      onSuccess: (res) => {
        if (!id) router.push(`/admin/events/${res.id}/tickets`);
      },
    });
  }

  return (
    <UploadsContext value={uploads}>
      <form onSubmit={submit} className="max-w-3xl space-y-6">
        <Group title="Basics">
          <Field label="Event name" htmlFor="title" className="sm:col-span-2">
            <Input {...text("title")} required maxLength={120} />
          </Field>
          <Field
            label="Page address"
            htmlFor="slug"
            help="Appears in the link: /events/your-address. Leave empty to build it from the name."
          >
            <Input {...text("slug")} placeholder="iron-mile-2027" />
          </Field>
          <Field label="Tagline" htmlFor="tagline" help="Small line above the title.">
            <Input {...text("tagline")} maxLength={120} placeholder="Run. Lift. Outlast." />
          </Field>
          <Field label="Summary" htmlFor="summary" className="sm:col-span-2" help="One or two sentences under the hero and in link previews.">
            <Textarea {...text("summary")} rows={3} maxLength={600} />
          </Field>
          <Field label="Cover image" htmlFor="coverImageUrl" className="sm:col-span-2" help="A wide photo works best. It fills the top of the event page.">
            <ImageInput
              id="coverImageUrl"
              value={v.coverImageUrl ?? ""}
              onChange={(url) => set("coverImageUrl", url)}
            />
          </Field>
          <Field label="Accent colour" htmlFor="accentColor" help="Used for buttons and highlights on this event's page and tickets.">
            <div className="flex items-center gap-2">
              <Input
                id="accentColor"
                type="color"
                value={v.accentColor}
                onChange={(e) => set("accentColor", e.target.value)}
                className="w-12 cursor-pointer p-1"
              />
              <Input
                aria-label="Accent colour hex value"
                value={v.accentColor}
                onChange={(e) => set("accentColor", e.target.value)}
                className="w-32 font-mono"
              />
            </div>
          </Field>
        </Group>

        <Group title="When">
          <Field label="Starts" htmlFor="startsAt">
            <Input {...text("startsAt")} type="datetime-local" required />
          </Field>
          <Field label="Ends" htmlFor="endsAt">
            <Input {...text("endsAt")} type="datetime-local" required />
          </Field>
          <Field label="Registration opens" htmlFor="registrationOpensAt" help="Empty = open as soon as the event is published.">
            <Input {...text("registrationOpensAt")} type="datetime-local" />
          </Field>
          <Field label="Registration closes" htmlFor="registrationClosesAt" help="Empty = open until the event ends.">
            <Input {...text("registrationClosesAt")} type="datetime-local" />
          </Field>
          <Field label="Timezone" htmlFor="timezone" help="All times above are in this timezone.">
            <Input {...text("timezone")} required placeholder="Asia/Kolkata" />
          </Field>
        </Group>

        <Group title="Where">
          <Field label="Venue" htmlFor="venueName">
            <Input {...text("venueName")} required />
          </Field>
          <Field label="City" htmlFor="city">
            <Input {...text("city")} />
          </Field>
          <Field label="Address" htmlFor="venueAddress" className="sm:col-span-2">
            <Input {...text("venueAddress")} />
          </Field>
          <Field label="Map link" htmlFor="mapUrl" className="sm:col-span-2">
            <Input {...text("mapUrl")} type="url" placeholder="https://maps.app.goo.gl/…" />
          </Field>
        </Group>

        <Group title="Capacity">
          <Field label="Total capacity" htmlFor="capacity" help="Across all ticket types. Empty = no overall limit.">
            <Input {...text("capacity")} type="number" min={1} inputMode="numeric" />
          </Field>
          <Field
            label="Tickets per order"
            htmlFor="maxTicketsPerOrder"
            help="1 = one person per registration. More lets a buyer register several people at once."
          >
            <Input
              id="maxTicketsPerOrder"
              type="number"
              min={1}
              max={20}
              required
              value={v.maxTicketsPerOrder as number}
              onChange={(e) => set("maxTicketsPerOrder", e.target.value as never)}
            />
          </Field>
        </Group>

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : id ? "Save changes" : "Create event"}
        </Button>
      </form>
    </UploadsContext>
  );
}
