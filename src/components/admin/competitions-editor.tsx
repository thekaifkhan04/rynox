"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  deleteCompetitionAction,
  deleteLevelAction,
  moveCompetitionAction,
  moveLevelAction,
  saveCompetitionAction,
  saveLevelAction,
} from "@/app/actions/admin";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Competition, CompetitionLevel } from "@/db/schema";
import { useAction } from "./use-action";

export type CompetitionRow = Competition & {
  levels: CompetitionLevel[];
  ticketTypeNames: string[];
};

function LevelRow({
  eventId,
  competitionId,
  level,
  number,
  position,
}: {
  eventId: string;
  competitionId: string;
  level: CompetitionLevel | null;
  number: number;
  position?: { first: boolean; last: boolean };
}) {
  const { pending, run } = useAction();
  const [name, setName] = useState(level?.name ?? "");
  const [description, setDescription] = useState(level?.description ?? "");
  const key = level?.id ?? `new-${competitionId}`;
  const dirty = !level || name !== level.name || description !== (level.description ?? "");

  return (
    <form
      className="grid items-end gap-2 sm:grid-cols-[2.5rem_1fr_1.5fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveLevelAction(eventId, competitionId, level?.id ?? null, { name, description }), {
          success: level ? "Level saved" : "Level added",
          onSuccess: () => {
            if (!level) {
              setName("");
              setDescription("");
            }
          },
        });
      }}
    >
      <span className="hidden pb-1.5 text-center font-mono text-sm text-muted-foreground sm:block" aria-hidden>
        {level ? String(number).padStart(2, "0") : "+"}
      </span>
      <div className="space-y-1.5">
        <Label htmlFor={`${key}-name`} className="text-xs text-muted-foreground">
          {level ? `Level ${number}` : "New level"}
        </Label>
        <Input
          id={`${key}-name`}
          required
          placeholder={number === 1 ? "Heats" : "Final"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${key}-desc`} className="text-xs text-muted-foreground">
          How to qualify, or what happens here
        </Label>
        <Input
          id={`${key}-desc`}
          placeholder="Top 8 times go through"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex gap-1">
        <Button type="submit" variant={level ? "outline" : "default"} disabled={pending || !dirty}>
          {level ? "Save" : (<><Plus /> Add level</>)}
        </Button>
        {level && (
          <>
            <Button type="button" variant="ghost" size="icon" aria-label="Move level up" disabled={pending || position?.first}
              onClick={() => run(() => moveLevelAction(eventId, competitionId, level.id, "up"))}>
              <ArrowUp />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Move level down" disabled={pending || position?.last}
              onClick={() => run(() => moveLevelAction(eventId, competitionId, level.id, "down"))}>
              <ArrowDown />
            </Button>
            <ConfirmButton
              variant="ghost"
              size="icon"
              aria-label={`Delete level ${level.name}`}
              disabled={pending}
              title={`Delete the level "${level.name}"?`}
              description="Entrants will no longer pass through this level. Levels cannot be deleted once results have been recorded."
              confirmLabel="Delete level"
              onConfirm={() =>
                run(() => deleteLevelAction(eventId, competitionId, level.id), { success: "Level deleted" })
              }
            >
              <Trash2 />
            </ConfirmButton>
          </>
        )}
      </div>
    </form>
  );
}

function CompetitionCard({
  eventId,
  competition,
  position,
}: {
  eventId: string;
  competition: CompetitionRow;
  position: { first: boolean; last: boolean };
}) {
  const { pending, run } = useAction();
  const [name, setName] = useState(competition.name);
  const [description, setDescription] = useState(competition.description ?? "");
  const dirty = name !== competition.name || description !== (competition.description ?? "");
  const levels = competition.levels;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
          {competition.name}
          <Badge variant="outline">
            {levels.length > 1 ? `${levels.length} levels` : "Single contest"}
          </Badge>
        </CardTitle>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="Move competition up" disabled={pending || position.first}
            onClick={() => run(() => moveCompetitionAction(eventId, competition.id, "up"))}>
            <ArrowUp />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Move competition down" disabled={pending || position.last}
            onClick={() => run(() => moveCompetitionAction(eventId, competition.id, "down"))}>
            <ArrowDown />
          </Button>
          <ConfirmButton
            variant="ghost"
            size="icon"
            aria-label={`Delete ${competition.name}`}
            disabled={pending}
            title={`Delete "${competition.name}"?`}
            description="The competition and its levels are removed. Its ticket types stay, as general entry. Competitions with registrations cannot be deleted."
            confirmLabel="Delete competition"
            onConfirm={() =>
              run(() => deleteCompetitionAction(eventId, competition.id), { success: "Competition deleted" })
            }
          >
            <Trash2 />
          </ConfirmButton>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="grid items-end gap-3 sm:grid-cols-[1fr_1.5fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveCompetitionAction(eventId, competition.id, { name, description }), {
              success: "Competition saved",
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${competition.id}-name`}>Name</Label>
            <Input id={`${competition.id}-name`} required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${competition.id}-desc`}>Description</Label>
            <Input
              id={`${competition.id}-desc`}
              placeholder="Shown on the event page"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={pending || !dirty}>
            Save
          </Button>
        </form>

        <Separator />

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Levels</h3>
            <p className="text-xs text-muted-foreground">
              Entrants start at level 1 and must qualify from each level to reach the next. Leave
              this empty, or add just one, for a straight contest with no qualifying.
            </p>
          </div>
          {levels.map((l, i) => (
            <LevelRow
              key={`${l.id}-${l.name}-${l.description}`}
              eventId={eventId}
              competitionId={competition.id}
              level={l}
              number={i + 1}
              position={{ first: i === 0, last: i === levels.length - 1 }}
            />
          ))}
          <LevelRow eventId={eventId} competitionId={competition.id} level={null} number={levels.length + 1} />
        </div>
      </CardContent>
      <CardFooter className="flex-wrap gap-2 text-sm text-muted-foreground">
        {competition.ticketTypeNames.length > 0 ? (
          <>
            Entered with:
            {competition.ticketTypeNames.map((n) => (
              <Badge key={n} variant="secondary">
                {n}
              </Badge>
            ))}
          </>
        ) : (
          "No ticket types yet. Assign one under Ticket types so people can enter."
        )}
      </CardFooter>
    </Card>
  );
}

export function CompetitionsEditor({ eventId, rows }: { eventId: string; rows: CompetitionRow[] }) {
  const { pending, run } = useAction();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="max-w-4xl space-y-4">
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          A competition is one thing a person can enter. How you set these up decides how the
          event runs:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-foreground">Level-wise event:</strong> one competition with
            several levels. Everyone starts at level 1 and has to qualify for the next.
          </li>
          <li>
            <strong className="text-foreground">Separate events:</strong> several competitions.
            People register for each one they want, independently.
          </li>
          <li>
            <strong className="text-foreground">Both:</strong> several competitions, each with its
            own levels.
          </li>
        </ul>
      </div>

      {rows.map((c, i) => (
        <CompetitionCard
          key={`${c.id}-${c.name}-${c.description}`}
          eventId={eventId}
          competition={c}
          position={{ first: i === 0, last: i === rows.length - 1 }}
        />
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Add a competition</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid items-end gap-3 sm:grid-cols-[1fr_1.5fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveCompetitionAction(eventId, null, { name, description }), {
                success: "Competition added",
                onSuccess: () => {
                  setName("");
                  setDescription("");
                },
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-competition-name">Name</Label>
              <Input
                id="new-competition-name"
                required
                placeholder="10K Run"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-competition-desc">Description</Label>
              <Input
                id="new-competition-desc"
                placeholder="Shown on the event page"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending}>
              <Plus /> Add competition
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
