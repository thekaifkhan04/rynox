"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { saveSheetAction, syncSheetAction } from "@/app/actions/admin";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "./use-action";

export function SheetSync({
  eventId,
  configured,
  serviceEmail,
  sheetId,
  syncedAt,
}: {
  eventId: string;
  /** Whether the server has Google service-account credentials. */
  configured: boolean;
  serviceEmail: string;
  sheetId: string | null;
  /** Already formatted in the event's timezone. */
  syncedAt: string | null;
}) {
  const { pending, run } = useAction();
  const sheetUrl = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}` : "";
  const [link, setLink] = useState(sheetUrl);
  const [editing, setEditing] = useState(!sheetId);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base font-semibold">Google Sheets</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {sheetId
              ? syncedAt
                ? `Last synced ${syncedAt}.`
                : "Linked, not synced yet."
              : "Keep a live copy of these registrations in a spreadsheet."}
          </p>
        </div>
        {configured && sheetId && !editing && (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                run(() => syncSheetAction(eventId), {
                  onSuccess: (res) =>
                    toast.success(
                      `${res.rows} registration${res.rows === 1 ? "" : "s"} written to the sheet`,
                    ),
                })
              }
            >
              <RefreshCw className={pending ? "animate-spin" : ""} />
              {pending ? "Syncing…" : "Sync to Google Sheets"}
            </Button>
            <Button asChild variant="outline">
              <a href={sheetUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Open sheet
              </a>
            </Button>
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Change
            </Button>
          </div>
        )}
      </CardHeader>

      {!configured ? (
        <CardContent>
          <Alert>
            <AlertTitle>Not set up on this server yet</AlertTitle>
            <AlertDescription>
              Add <code>GOOGLE_SHEETS_CLIENT_EMAIL</code> and <code>GOOGLE_SHEETS_PRIVATE_KEY</code>{" "}
              (a Google Cloud service account with the Sheets API enabled) to the environment. The
              README has the steps. Until then, use Export CSV.
            </AlertDescription>
          </Alert>
        </CardContent>
      ) : (
        editing && (
          <CardContent className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Create or open a Google Sheet.</li>
              <li>
                Click Share and add{" "}
                <strong className="font-mono text-foreground select-all">{serviceEmail}</strong> as an
                Editor.
              </li>
              <li>Paste the sheet&apos;s link below.</li>
            </ol>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => saveSheetAction(eventId, link), {
                  success: link.trim() ? "Sheet linked" : "Sheet unlinked",
                  onSuccess: () => setEditing(!link.trim()),
                });
              }}
            >
              <div className="grow space-y-1.5">
                <Label htmlFor="sheet-link">Google Sheet link</Label>
                <Input
                  id="sheet-link"
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={pending}>
                {link.trim() ? "Save link" : "Unlink"}
              </Button>
              {sheetId && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setLink(sheetUrl);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              )}
            </form>
            <p className="text-xs text-muted-foreground">
              Syncing rewrites a tab named “Registrations” with every current registration. Other
              tabs in the spreadsheet are left alone, so keep your own notes and formulas there.
            </p>
          </CardContent>
        )
      )}
    </Card>
  );
}
