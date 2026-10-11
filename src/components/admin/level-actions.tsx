"use client";

import { useState } from "react";
import { Check, Undo2, X } from "lucide-react";
import { recordLevelResultAction, undoLevelResultAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "./use-action";

/** Decide an entrant's current level: through to the next, or out. */
export function DecideLevel({
  ticketId,
  levelId,
  name,
  isLast,
}: {
  ticketId: string;
  levelId: string;
  name: string;
  isLast: boolean;
}) {
  const { pending, run } = useAction();
  const [result, setResult] = useState("");
  const decide = (outcome: "QUALIFIED" | "ELIMINATED") =>
    run(() => recordLevelResultAction({ ticketId, levelId, outcome, result }), {
      success:
        outcome === "ELIMINATED"
          ? `${name} is out`
          : isLast
            ? `${name} finished`
            : `${name} qualified for the next level`,
    });

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Input
        aria-label={`Result for ${name}`}
        placeholder="Time, weight or score"
        value={result}
        onChange={(e) => setResult(e.target.value)}
        maxLength={120}
        className="w-44"
      />
      <Button size="sm" disabled={pending} onClick={() => decide("QUALIFIED")}>
        <Check /> {isLast ? "Finished" : "Qualify"}
      </Button>
      <Button size="sm" variant="destructive" disabled={pending} onClick={() => decide("ELIMINATED")}>
        <X /> Out
      </Button>
    </div>
  );
}

export function UndoLevel({ ticketId, name }: { ticketId: string; name: string }) {
  const { pending, run } = useAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={`Undo the last result for ${name}`}
      onClick={() => run(() => undoLevelResultAction(ticketId), { success: "Last result undone" })}
    >
      <Undo2 /> Undo
    </Button>
  );
}
