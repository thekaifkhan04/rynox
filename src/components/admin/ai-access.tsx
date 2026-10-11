"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { createApiTokenAction, revokeApiTokenAction } from "@/app/actions/admin";
import { ConfirmButton } from "@/components/confirm-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAction } from "./use-action";

export type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
};

function CopyBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-white/10 bg-background p-3 pr-12 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
        {text}
      </pre>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Copy ${label}`}
        className="absolute top-2 right-2"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error("Could not copy. Select the text and copy it by hand.");
          }
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

export function AiAccess({ url, tokens, tools }: { url: string; tokens: TokenRow[]; tools: { name: string; description: string }[] }) {
  const { pending, run } = useAction();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const token = fresh ?? "YOUR_TOKEN";

  const json = JSON.stringify(
    { mcpServers: { events: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2,
  );

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">AI access</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Connect an AI assistant and create events by describing them, instead of filling in each
          form. It works with any assistant that supports the Model Context Protocol (MCP), such
          as Claude Code, Claude Desktop, Cursor or VS Code.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">1. Create an access token</CardTitle>
          <p className="text-sm text-muted-foreground">
            A token lets an assistant act as you. Give each assistant its own, and revoke it when
            you stop using it.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => createApiTokenAction(name), {
                onSuccess: (res) => {
                  setFresh(res.token);
                  setName("");
                },
              });
            }}
          >
            <div className="grow space-y-1.5 sm:max-w-xs">
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                placeholder="Claude on my laptop"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </div>
            <Button type="submit" disabled={pending}>
              <KeyRound /> Create token
            </Button>
          </form>

          {fresh && (
            <Alert className="border-emerald-400/40">
              <AlertTitle>Copy this token now</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>It is shown only once. If you lose it, revoke it and create another.</p>
                <CopyBlock text={fresh} label="token" />
              </AlertDescription>
            </Alert>
          )}

          {tokens.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((t) => (
                  <TableRow key={t.id} className={t.revoked ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono text-xs">{t.prefix}…</TableCell>
                    <TableCell>{t.createdAt}</TableCell>
                    <TableCell>{t.lastUsedAt ?? "Never"}</TableCell>
                    <TableCell className="text-right">
                      {t.revoked ? (
                        <Badge variant="outline">Revoked</Badge>
                      ) : (
                        <ConfirmButton
                          size="sm"
                          variant="destructive"
                          disabled={pending}
                          title={`Revoke "${t.name}"?`}
                          description="Any assistant using this token loses access immediately. This cannot be undone."
                          confirmLabel="Revoke token"
                          onConfirm={() => run(() => revokeApiTokenAction(t.id), { success: "Token revoked" })}
                        >
                          Revoke
                        </ConfirmButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">2. Connect your assistant</CardTitle>
          <p className="text-sm text-muted-foreground">
            {fresh
              ? "Your new token is already filled in below."
              : "Replace YOUR_TOKEN with a token from step 1."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Server address</Label>
            <CopyBlock text={url} label="server address" />
          </div>
          <Tabs defaultValue="claude-code">
            <TabsList>
              <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
              <TabsTrigger value="json">Cursor, VS Code and others</TabsTrigger>
            </TabsList>
            <TabsContent value="claude-code" className="space-y-2">
              <p className="text-sm text-muted-foreground">Run this once in a terminal:</p>
              <CopyBlock
                label="Claude Code command"
                text={`claude mcp add --transport http events ${url} --header "Authorization: Bearer ${token}"`}
              />
            </TabsContent>
            <TabsContent value="json" className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Add this to the assistant&apos;s MCP settings file. The connection is HTTP with a
                bearer token in the Authorization header.
              </p>
              <CopyBlock label="MCP configuration" text={json} />
            </TabsContent>
          </Tabs>
          {url.includes("localhost") && (
            <Alert>
              <AlertDescription>
                This address is your own computer, so only assistants running on this machine can
                reach it. Once the site is deployed, this page shows its public address.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">3. Ask for what you want</CardTitle>
          <p className="text-sm text-muted-foreground">For example:</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <blockquote className="border-l-2 border-white/20 pl-4 text-sm text-white/80">
            Create an event called City Night Run at Kalinga Stadium, Bhubaneswar on 14 February
            2027 from 6 PM to 10 PM. Two separate races, 5K at ₹400 and 10K at ₹700, 300 seats
            each. Ask for T-shirt size and an emergency contact. Write the landing page from this.
          </blockquote>
          <p className="text-sm text-muted-foreground">
            Events are always created as drafts, so you can review them here before anything is
            public. The assistant can publish only when you tell it to. It cannot delete events,
            refund payments or change individual registrations.
          </p>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">
                <ChevronsUpDown /> What the assistant can do ({tools.length} tools)
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-3 space-y-2 text-sm">
                {tools.map((t) => (
                  <li key={t.name}>
                    <code className="text-xs">{t.name}</code>
                    <span className="text-muted-foreground"> — {t.description.split(". ")[0]}.</span>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  );
}
