"use client";

import { useRouter } from "next/navigation";
import { deleteEventAction, setEventStatusAction } from "@/app/actions/admin";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import type { Event } from "@/db/schema";
import { useAction } from "./use-action";

export function EventStatusControls({ id, status }: { id: string; status: Event["status"] }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const set = (next: Event["status"], success: string) =>
    run(() => setEventStatusAction(id, next), { success });

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "PUBLISHED" && status !== "CANCELLED" && (
        <Button disabled={pending} onClick={() => set("PUBLISHED", "Event is live")}>
          {status === "CLOSED" ? "Reopen registration" : "Publish"}
        </Button>
      )}
      {status === "PUBLISHED" && (
        <>
          <Button variant="outline" disabled={pending} onClick={() => set("CLOSED", "Registration closed")}>
            Close registration
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => set("DRAFT", "Moved back to draft")}>
            Unpublish
          </Button>
        </>
      )}
      {status !== "CANCELLED" && status !== "DRAFT" && (
        <ConfirmButton
          variant="destructive"
          disabled={pending}
          title="Cancel this event?"
          description="Registration stops and the page shows the event as cancelled. Tickets are not refunded automatically; refund them from Registrations."
          confirmLabel="Cancel event"
          cancelLabel="Keep event"
          onConfirm={() => set("CANCELLED", "Event cancelled")}
        >
          Cancel event
        </ConfirmButton>
      )}
      {status === "CANCELLED" && (
        <Button variant="outline" disabled={pending} onClick={() => set("DRAFT", "Moved back to draft")}>
          Restore as draft
        </Button>
      )}
      {status === "DRAFT" && (
        <ConfirmButton
          variant="destructive"
          disabled={pending}
          title="Delete this draft event?"
          description="The event, its ticket types and its landing page are removed. This cannot be undone."
          confirmLabel="Delete event"
          onConfirm={() =>
            run(() => deleteEventAction(id), {
              success: "Event deleted",
              onSuccess: () => router.push("/admin/events"),
            })
          }
        >
          Delete
        </ConfirmButton>
      )}
    </div>
  );
}
