import Link from "next/link";
import { notFound } from "next/navigation";
import { DecideLevel, UndoLevel } from "@/components/admin/level-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/session";
import { getEventById } from "@/server/events";
import { listEntrants, progressOf } from "@/server/progress";

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export const metadata = { title: "Levels & results" };

export default async function ProgressPage({
  params,
  searchParams,
}: PageProps<"/admin/events/[id]/progress">) {
  const { id } = await params;
  await requireAdmin();
  const event = await getEventById(id);
  if (!event) notFound();

  const base = `/admin/events/${event.id}`;
  if (event.competitions.length === 0) {
    return (
      <Alert className="max-w-2xl">
        <AlertTitle>No competitions yet</AlertTitle>
        <AlertDescription>
          Add a competition and its levels first, then come back here to move entrants from one
          level to the next.
          <Button asChild size="sm" className="mt-3 flex w-fit">
            <Link href={`${base}/competitions`}>Set up competitions</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const wanted = (await searchParams).competition;
  const competition =
    event.competitions.find((c) => c.id === (Array.isArray(wanted) ? wanted[0] : wanted)) ??
    event.competitions[0];
  const levels = competition.levels;
  const entrants = (await listEntrants(competition.id)).map((t) => ({
    ticket: t,
    progress: progressOf(levels, t.levelResults),
    results: new Map(t.levelResults.map((r) => [r.levelId, r])),
  }));
  const out = entrants.filter((e) => e.progress.state === "eliminated");
  const done = entrants.filter((e) => e.progress.state === "completed");

  return (
    <div className="space-y-6">
      <nav aria-label="Competitions" className="flex flex-wrap gap-2">
        {event.competitions.map((c) => (
          <Button
            key={c.id}
            asChild
            variant={c.id === competition.id ? "default" : "outline"}
            aria-current={c.id === competition.id ? "page" : undefined}
          >
            <Link href={`${base}/progress?competition=${c.id}`}>{c.name}</Link>
          </Button>
        ))}
      </nav>

      <p className="text-sm text-muted-foreground">
        {entrants.length} entrant{entrants.length === 1 ? "" : "s"} with a valid ticket
        {levels.length > 0 && ` · ${done.length} finished · ${out.length} out`}
      </p>

      {levels.length === 0 ? (
        <Alert className="max-w-2xl">
          <AlertTitle>{competition.name} has no levels</AlertTitle>
          <AlertDescription>
            It runs as a straight contest. Add levels if entrants need to qualify from one round
            to the next, or add a single level to record who finished and their result.
            <Button asChild size="sm" variant="outline" className="mt-3 flex w-fit">
              <Link href={`${base}/competitions`}>Edit levels</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        levels.map((level, index) => {
          const here = entrants.filter(
            (e) => e.progress.state === "active" && e.progress.level.id === level.id,
          );
          const isLast = index === levels.length - 1;
          return (
            <Card key={level.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
                  <span className="font-mono text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {level.name}
                  <Badge variant="outline">{here.length} to compete</Badge>
                </CardTitle>
                {level.description && (
                  <p className="text-sm text-muted-foreground">{level.description}</p>
                )}
              </CardHeader>
              <CardContent className="px-0">
                {here.length === 0 ? (
                  <p className="px-4 text-sm text-muted-foreground">
                    {index === 0
                      ? "Nobody is waiting at this level."
                      : "Nobody has qualified for this level yet, or everyone here has been decided."}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Entrant</TableHead>
                        <TableHead>Ticket</TableHead>
                        {index > 0 && <TableHead>Previous result</TableHead>}
                        <TableHead className="pr-4 text-right">
                          {isLast ? "Finished or out" : "Qualify or out"}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {here.map(({ ticket, results }) => (
                        <TableRow key={ticket.id}>
                          <TableCell className="pl-4 font-medium">
                            {ticket.attendeeName}
                            {!ticket.checkedInAt && (
                              <Badge variant="outline" className="ml-2 text-muted-foreground">
                                Not checked in
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {ticket.ticketType.name}
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              {ticket.ticketCode}
                            </span>
                          </TableCell>
                          {index > 0 && (
                            <TableCell className="text-muted-foreground">
                              {results.get(levels[index - 1].id)?.result ?? "—"}
                              <UndoLevel ticketId={ticket.id} name={ticket.attendeeName} />
                            </TableCell>
                          )}
                          <TableCell className="pr-4">
                            <DecideLevel
                              ticketId={ticket.id}
                              levelId={level.id}
                              name={ticket.attendeeName}
                              isLast={isLast}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {[
        { title: "Finished", rows: done, tone: "text-emerald-300" },
        { title: "Out", rows: out, tone: "text-red-300" },
      ].map(
        (group) =>
          group.rows.length > 0 && (
            <Card key={group.title}>
              <CardHeader>
                <CardTitle className={`text-base font-semibold ${group.tone}`}>
                  {group.title} · {group.rows.length}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Entrant</TableHead>
                      <TableHead>Ticket</TableHead>
                      <TableHead>{group.title === "Out" ? "Went out at" : "Final level"}</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead className="pr-4" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map(({ ticket, progress, results }) =>
                      progress.state === "none" ? null : (
                        <TableRow key={ticket.id}>
                          <TableCell className="pl-4 font-medium">{ticket.attendeeName}</TableCell>
                          <TableCell>
                            {ticket.ticketType.name}
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              {ticket.ticketCode}
                            </span>
                          </TableCell>
                          <TableCell>{progress.level.name}</TableCell>
                          <TableCell>{results.get(progress.level.id)?.result ?? "—"}</TableCell>
                          <TableCell className="pr-4 text-right">
                            <UndoLevel ticketId={ticket.id} name={ticket.attendeeName} />
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ),
      )}
    </div>
  );
}
