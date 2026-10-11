import { blankEvent, EventForm } from "@/components/admin/event-form";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/session";

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export const metadata = { title: "New event" };

export default async function NewEventPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New event</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        The event starts as a draft with a default landing page. Next you&apos;ll set ticket types
        and prices, then publish when you&apos;re ready.
      </p>
      <EventForm id={null} initial={blankEvent} uploads={Boolean(env.blobToken)} />
    </div>
  );
}
