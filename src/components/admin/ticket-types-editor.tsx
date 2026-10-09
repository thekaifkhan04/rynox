"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  deleteTicketTypeAction,
  moveTicketTypeAction,
  saveTicketTypeAction,
} from "@/app/actions/admin";
import { ConfirmButton } from "@/components/confirm-button";
import { SimpleSelect } from "@/components/simple-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAction } from "./use-action";

export type TicketTypeRow = {
  id: string;
  name: string;
  description: string;
  /** "" = general entry, not part of a competition. */
  competitionId: string;
  price: string;
  offlinePrice: string;
  quota: string;
  active: boolean;
  sold: number;
};

const blank = { name: "", description: "", competitionId: "", price: "", offlinePrice: "", quota: "", active: true };

function Row({
  eventId,
  row,
  position,
  onDone,
  competitions,
}: {
  competitions: { id: string; name: string }[];
  eventId: string;
  row: TicketTypeRow | null;
  position?: { first: boolean; last: boolean };
  onDone?: () => void;
}) {
  const { pending, run } = useAction();
  const [v, setV] = useState(row ?? blank);
  const key = row?.id ?? "new";
  const dirty = !row || (["name", "description", "competitionId", "price", "offlinePrice", "quota", "active"] as const).some((k) => v[k] !== row[k]);

  return (
    <Card>
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveTicketTypeAction(eventId, row?.id ?? null, v), {
          success: row ? "Ticket type saved" : "Ticket type added",
          onSuccess: () => {
            if (!row) setV(blank);
            onDone?.();
          },
        });
      }}
    >
      <CardContent className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor={`${key}-name`}>Name</Label>
          <Input
            id={`${key}-name`}
            required
            placeholder="10K Run · Women"
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${key}-price`}>Online price (₹)</Label>
          <Input
            id={`${key}-price`}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            placeholder="0 = free"
            value={v.price}
            onChange={(e) => setV({ ...v, price: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${key}-offline`}>Offline price (₹)</Label>
          <Input
            id={`${key}-offline`}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            placeholder="Same as online"
            value={v.offlinePrice}
            onChange={(e) => setV({ ...v, offlinePrice: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${key}-quota`}>Seats</Label>
          <Input
            id={`${key}-quota`}
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="No limit"
            value={v.quota}
            onChange={(e) => setV({ ...v, quota: e.target.value })}
          />
        </div>
        {competitions.length > 0 && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${key}-competition`}>Enters competition</Label>
            <SimpleSelect
              id={`${key}-competition`}
              value={v.competitionId || "none"}
              onValueChange={(id) => setV({ ...v, competitionId: id === "none" ? "" : id })}
              options={[
                { value: "none", label: "None (general entry)" },
                ...competitions.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
        )}
        <div className={`space-y-1.5 ${competitions.length > 0 ? "sm:col-span-2" : "sm:col-span-4"}`}>
          <Label htmlFor={`${key}-desc`}>Description</Label>
          <Input
            id={`${key}-desc`}
            placeholder="Shown under the name on the event page"
            value={v.description}
            onChange={(e) => setV({ ...v, description: e.target.value })}
          />
        </div>
      </CardContent>
      <CardFooter className="flex-wrap gap-3">
        <Button type="submit" disabled={pending || !dirty}>
          {row ? "Save" : "Add ticket type"}
        </Button>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Switch checked={v.active} onCheckedChange={(active) => setV({ ...v, active })} />
          On sale
        </Label>
        {row && (
          <>
            <span className="text-sm text-muted-foreground">{row.sold} sold</span>
            <div className="ml-auto flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Move up"
                disabled={pending || position?.first}
                onClick={() => run(() => moveTicketTypeAction(eventId, row.id, "up"))}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Move down"
                disabled={pending || position?.last}
                onClick={() => run(() => moveTicketTypeAction(eventId, row.id, "down"))}
              >
                <ArrowDown />
              </Button>
              <ConfirmButton
                variant="ghost"
                size="icon"
                aria-label={`Delete ${row.name}`}
                disabled={pending}
                title={`Delete "${row.name}"?`}
                description="This ticket type is removed from the event. Types with issued tickets cannot be deleted; switch them off instead."
                confirmLabel="Delete"
                onConfirm={() =>
                  run(() => deleteTicketTypeAction(eventId, row.id), { success: "Ticket type deleted" })
                }
              >
                <Trash2 />
              </ConfirmButton>
            </div>
          </>
        )}
      </CardFooter>
    </form>
    </Card>
  );
}

export function TicketTypesEditor({
  eventId,
  rows,
  competitions,
}: {
  eventId: string;
  rows: TicketTypeRow[];
  competitions: { id: string; name: string }[];
}) {
  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Each ticket type is a category attendees can register for, with its own price and seat
        limit. Use them for divisions such as men, women, age groups or weight classes. The
        offline price is what you charge when you register someone in person from the
        Registrations tab.
      </p>
      {rows.map((r, i) => (
        <Row
          competitions={competitions}
          key={`${r.id}-${r.name}-${r.competitionId}-${r.price}-${r.offlinePrice}-${r.quota}-${r.active}-${r.description}`}
          eventId={eventId}
          row={r}
          position={{ first: i === 0, last: i === rows.length - 1 }}
        />
      ))}
      <h2 className="pt-4 text-sm font-semibold">Add a ticket type</h2>
      <Row eventId={eventId} row={null} competitions={competitions} />
    </div>
  );
}
