"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  deleteFormFieldAction,
  moveFormFieldAction,
  saveFormFieldAction,
} from "@/app/actions/admin";
import { ConfirmButton } from "@/components/confirm-button";
import { SimpleSelect } from "@/components/simple-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { FormField } from "@/db/schema";
import { useAction } from "./use-action";

const TYPES: { value: FormField["type"]; label: string }[] = [
  { value: "TEXT", label: "Short text" },
  { value: "TEXTAREA", label: "Long text" },
  { value: "NUMBER", label: "Number" },
  { value: "SELECT", label: "Dropdown" },
  { value: "CHECKBOX", label: "Checkbox" },
];

type Draft = { label: string; type: FormField["type"]; options: string; required: boolean };
const blank: Draft = { label: "", type: "TEXT", options: "", required: false };

function Row({
  eventId,
  field,
  position,
}: {
  eventId: string;
  field: FormField | null;
  position?: { first: boolean; last: boolean };
}) {
  const { pending, run } = useAction();
  const [v, setV] = useState<Draft>(
    field
      ? { label: field.label, type: field.type, options: field.options.join("\n"), required: field.required }
      : blank,
  );
  const key = field?.id ?? "new";

  return (
    <Card>
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault();
        const options = v.options.split("\n").map((o) => o.trim()).filter(Boolean);
        run(() => saveFormFieldAction(eventId, field?.id ?? null, { ...v, options }), {
          success: field ? "Question saved" : "Question added",
          onSuccess: () => !field && setV(blank),
        });
      }}
    >
      <CardContent className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor={`${key}-label`}>Question</Label>
          <Input
            id={`${key}-label`}
            required
            placeholder="T-shirt size"
            value={v.label}
            onChange={(e) => setV({ ...v, label: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${key}-type`}>Answer type</Label>
          <SimpleSelect
            id={`${key}-type`}
            value={v.type}
            onValueChange={(type) => setV({ ...v, type: type as FormField["type"] })}
            options={TYPES}
          />
        </div>
        {v.type === "SELECT" && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${key}-options`}>Options (one per line)</Label>
            <Textarea
              id={`${key}-options`}
              rows={4}
              value={v.options}
              onChange={(e) => setV({ ...v, options: e.target.value })}
            />
          </div>
        )}
      </CardContent>
      <CardFooter className="flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {field ? "Save" : "Add question"}
        </Button>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Switch checked={v.required} onCheckedChange={(required) => setV({ ...v, required })} />
          Required
        </Label>
        {field && (
          <div className="ml-auto flex gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label="Move up" disabled={pending || position?.first}
              onClick={() => run(() => moveFormFieldAction(eventId, field.id, "up"))}>
              <ArrowUp />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Move down" disabled={pending || position?.last}
              onClick={() => run(() => moveFormFieldAction(eventId, field.id, "down"))}>
              <ArrowDown />
            </Button>
            <ConfirmButton
              variant="ghost"
              size="icon"
              aria-label={`Delete ${field.label}`}
              disabled={pending}
              title={`Delete the question "${field.label}"?`}
              description="New registrations will no longer be asked this. Answers already collected stay on each ticket."
              confirmLabel="Delete"
              onConfirm={() => run(() => deleteFormFieldAction(eventId, field.id), { success: "Question deleted" })}
            >
              <Trash2 />
            </ConfirmButton>
          </div>
        )}
      </CardFooter>
    </form>
    </Card>
  );
}

export function FormFieldsEditor({ eventId, fields }: { eventId: string; fields: FormField[] }) {
  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Every registration asks for full name, email, phone number and college / company / club.
        Add anything else this event needs below. Each attendee answers these questions.
      </p>
      {fields.map((f, i) => (
        <Row key={f.id} eventId={eventId} field={f} position={{ first: i === 0, last: i === fields.length - 1 }} />
      ))}
      <h2 className="pt-4 text-sm font-semibold">Add a question</h2>
      <Row eventId={eventId} field={null} />
    </div>
  );
}
