import Link from "next/link";
import { FeatureToggle } from "@/components/admin/feature-toggle";
import { EventStatusBadge } from "@/components/admin/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";
import { requireAdmin } from "@/lib/session";
import { listEventsWithStats } from "@/server/admin-queries";

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export const metadata = { title: "Events" };

export default async function AdminEventsPage() {
  await requireAdmin();
  const rows = await listEventsWithStats();
  const now = new Date();
  // Mirrors what the home page does: the featured event if it can be shown, else the next one.
  const showable = rows
    .map((r) => r.event)
    .filter((e) => (e.status === "PUBLISHED" || e.status === "CLOSED") && e.endsAt >= now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const featured = rows.find((r) => r.event.featuredOnHome)?.event ?? null;
  const onHome = showable.find((e) => e.featuredOnHome) ?? showable[0] ?? null;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        <Button asChild size="lg" className="px-4">
          <Link href="/admin/events/new">New event</Link>
        </Button>
      </div>
      {rows.length > 0 && (
        <Alert>
          <AlertTitle>
            {onHome ? `The home page is showing ${onHome.title}` : "The home page has no event to show"}
          </AlertTitle>
          <AlertDescription>
            {featured && onHome?.id === featured.id
              ? "You chose this event. Use “On the home page” on its card to go back to showing whichever event is next."
              : featured
                ? `You chose ${featured.title}, but it is ${
                    featured.endsAt < now ? "over" : "not published"
                  }, so the next upcoming event is shown instead.`
                : onHome
                  ? "This is the next upcoming event, picked automatically. Use “Show on home page” on any event to choose one yourself."
                  : "Publish an event and it will appear there."}
          </AlertDescription>
        </Alert>
      )}
      {rows.length === 0 ? (
        <Card className="border border-dashed border-white/15 bg-transparent ring-0">
          <CardContent className="py-4 text-center text-muted-foreground">No events yet.</CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map(({ event, stats }) => {
            const base = `/admin/events/${event.id}`;
            return (
              <li key={event.id}>
                <Card className="h-full" style={{ borderLeft: `4px solid ${event.accentColor}` }}>
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg font-bold">
                        <Link href={base} className="hover:underline">
                          {event.title}
                        </Link>
                      </CardTitle>
                      <p className="mt-1 text-sm text-white/65">
                        {formatDateTime(event.startsAt, event.timezone)} · {event.venueName}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <EventStatusBadge status={event.status} />
                      {onHome?.id === event.id && <Badge variant="outline">Home page</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm text-white/75">
                    {stats.sold} sold{event.capacity != null ? ` of ${event.capacity}` : ""} ·{" "}
                    {stats.checkedIn} checked in
                  </CardContent>
                  <CardFooter className="flex-wrap gap-1">
                    {[
                      [base, "Edit"],
                      [`${base}/landing`, "Landing page"],
                      [`${base}/registrations`, "Registrations"],
                      [`${base}/check-in`, "Check-in"],
                      [`/events/${event.slug}`, "View page"],
                    ].map(([href, label]) => (
                      <Button key={href} asChild variant="ghost" size="sm">
                        <Link href={href}>{label}</Link>
                      </Button>
                    ))}
                    <span className="ml-auto">
                      <FeatureToggle
                        eventId={event.id}
                        title={event.title}
                        featured={event.featuredOnHome}
                        size="sm"
                      />
                    </span>
                  </CardFooter>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
