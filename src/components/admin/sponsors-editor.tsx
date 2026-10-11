"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Trash2, X } from "lucide-react";
import {
  deleteSponsorAction,
  deleteSponsorTierAction,
  moveSponsorTierAction,
  saveSponsorAction,
  saveSponsorTierAction,
  setSponsorStatusAction,
} from "@/app/actions/admin";
import { ConfirmButton } from "@/components/confirm-button";
import { SimpleSelect } from "@/components/simple-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Sponsor } from "@/db/schema";
import { ImageInput, UploadsContext } from "./image-input";
import { useAction } from "./use-action";

export type TierRow = {
  id: string;
  name: string;
  benefits: string;
  price: string;
  slots: string;
  showInHero: boolean;
  active: boolean;
  approved: number;
};

const blankTier = { name: "", benefits: "", price: "", slots: "", showInHero: true, active: true };

function TierForm({
  eventId,
  tier,
  position,
}: {
  eventId: string;
  tier: TierRow | null;
  position?: { first: boolean; last: boolean };
}) {
  const { pending, run } = useAction();
  const [v, setV] = useState(tier ?? blankTier);
  const key = tier?.id ?? "new-tier";
  const dirty =
    !tier || (["name", "benefits", "price", "slots", "showInHero", "active"] as const).some((k) => v[k] !== tier[k]);

  return (
    <Card>
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveSponsorTierAction(eventId, tier?.id ?? null, v), {
            success: tier ? "Level saved" : "Level added",
            onSuccess: () => !tier && setV(blankTier),
          });
        }}
      >
        <CardContent className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor={`${key}-name`}>Level name</Label>
            <Input
              id={`${key}-name`}
              required
              placeholder="Title sponsor"
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${key}-price`}>Amount (₹)</Label>
            <Input
              id={`${key}-price`}
              type="number"
              min={0}
              inputMode="decimal"
              placeholder="On request"
              value={v.price}
              onChange={(e) => setV({ ...v, price: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${key}-slots`}>Places</Label>
            <Input
              id={`${key}-slots`}
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="No limit"
              value={v.slots}
              onChange={(e) => setV({ ...v, slots: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor={`${key}-benefits`}>What the sponsor gets (one per line)</Label>
            <Textarea
              id={`${key}-benefits`}
              rows={3}
              placeholder={"Logo on the event page hero\nStall at the venue"}
              value={v.benefits}
              onChange={(e) => setV({ ...v, benefits: e.target.value })}
            />
          </div>
        </CardContent>
        <CardFooter className="flex-wrap gap-4">
          <Button type="submit" disabled={pending || !dirty}>
            {tier ? "Save" : (<><Plus /> Add level</>)}
          </Button>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Switch checked={v.showInHero} onCheckedChange={(showInHero) => setV({ ...v, showInHero })} />
            Show sponsors in the hero
          </Label>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Switch checked={v.active} onCheckedChange={(active) => setV({ ...v, active })} />
            Open to requests
          </Label>
          {tier && (
            <>
              <span className="text-sm text-muted-foreground">
                {tier.approved} sponsor{tier.approved === 1 ? "" : "s"}
                {tier.slots ? ` of ${tier.slots}` : ""}
              </span>
              <div className="ml-auto flex gap-1">
                <Button type="button" variant="ghost" size="icon" aria-label="Move level up" disabled={pending || position?.first}
                  onClick={() => run(() => moveSponsorTierAction(eventId, tier.id, "up"))}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Move level down" disabled={pending || position?.last}
                  onClick={() => run(() => moveSponsorTierAction(eventId, tier.id, "down"))}>
                  <ArrowDown />
                </Button>
                <ConfirmButton
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${tier.name}`}
                  disabled={pending}
                  title={`Delete the level "${tier.name}"?`}
                  description="Levels that have sponsors or requests cannot be deleted; switch them off instead."
                  confirmLabel="Delete level"
                  onConfirm={() => run(() => deleteSponsorTierAction(eventId, tier.id), { success: "Level deleted" })}
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

const statusStyle: Record<Sponsor["status"], string> = {
  PENDING: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  APPROVED: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  REJECTED: "border-red-400/40 bg-red-400/10 text-red-300",
};
const statusLabel: Record<Sponsor["status"], string> = {
  PENDING: "Awaiting review",
  APPROVED: "Live on the page",
  REJECTED: "Declined",
};

function SponsorForm({
  eventId,
  sponsor,
  tiers,
}: {
  eventId: string;
  sponsor: Sponsor | null;
  tiers: { id: string; name: string }[];
}) {
  const { pending, run } = useAction();
  const initial = {
    tierId: sponsor?.tierId ?? tiers[0]?.id ?? "",
    companyName: sponsor?.companyName ?? "",
    website: sponsor?.website ?? "",
    logoUrl: sponsor?.logoUrl ?? "",
    paid: sponsor?.paid ?? false,
  };
  const [v, setV] = useState(initial);
  const key = sponsor?.id ?? "new-sponsor";

  return (
    <Card>
      {sponsor && (
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
              {sponsor.companyName}
              <Badge variant="outline" className={statusStyle[sponsor.status]}>
                {statusLabel[sponsor.status]}
              </Badge>
              {sponsor.paid && <Badge variant="outline">Paid</Badge>}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {[sponsor.contactName, sponsor.email, sponsor.phone].filter(Boolean).join(" · ")}
            </p>
            {sponsor.message && <p className="mt-2 max-w-2xl text-sm">“{sponsor.message}”</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {sponsor.status !== "APPROVED" && (
              <Button
                disabled={pending}
                onClick={() =>
                  run(() => setSponsorStatusAction(sponsor.id, "APPROVED"), {
                    success: `${sponsor.companyName} is now shown on the event page`,
                  })
                }
              >
                <Check /> Approve
              </Button>
            )}
            {sponsor.status !== "REJECTED" && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(() => setSponsorStatusAction(sponsor.id, "REJECTED"), {
                    success: sponsor.status === "APPROVED" ? "Removed from the event page" : "Request declined",
                  })
                }
              >
                <X /> {sponsor.status === "APPROVED" ? "Take down" : "Decline"}
              </Button>
            )}
            <ConfirmButton
              variant="ghost"
              size="icon"
              aria-label={`Delete ${sponsor.companyName}`}
              disabled={pending}
              title={`Delete ${sponsor.companyName}?`}
              description="The sponsor and their request are removed for good."
              confirmLabel="Delete sponsor"
              onConfirm={() => run(() => deleteSponsorAction(eventId, sponsor.id), { success: "Sponsor deleted" })}
            >
              <Trash2 />
            </ConfirmButton>
          </div>
        </CardHeader>
      )}
      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveSponsorAction(eventId, sponsor?.id ?? null, v), {
            success: sponsor ? "Sponsor saved" : "Sponsor added to the event page",
            onSuccess: () => !sponsor && setV({ ...initial, companyName: "", website: "", logoUrl: "" }),
          });
        }}
      >
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${key}-company`}>Sponsor name</Label>
            <Input
              id={`${key}-company`}
              required
              value={v.companyName}
              onChange={(e) => setV({ ...v, companyName: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${key}-tier`}>Level</Label>
            <SimpleSelect
              id={`${key}-tier`}
              value={v.tierId}
              onValueChange={(tierId) => setV({ ...v, tierId })}
              options={tiers.map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${key}-logo`}>Logo</Label>
            <ImageInput id={`${key}-logo`} value={v.logoUrl} onChange={(logoUrl) => setV({ ...v, logoUrl })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${key}-website`}>Website</Label>
            <Input
              id={`${key}-website`}
              type="url"
              placeholder="https://"
              value={v.website}
              onChange={(e) => setV({ ...v, website: e.target.value })}
            />
          </div>
        </CardContent>
        <CardFooter className="flex-wrap gap-4">
          <Button type="submit" variant={sponsor ? "outline" : "default"} disabled={pending}>
            {sponsor ? "Save details" : (<><Plus /> Add sponsor</>)}
          </Button>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Switch checked={v.paid} onCheckedChange={(paid) => setV({ ...v, paid })} />
            Payment received
          </Label>
        </CardFooter>
      </form>
    </Card>
  );
}

export function SponsorsEditor({
  eventId,
  slug,
  tiers,
  sponsors,
  uploads,
}: {
  eventId: string;
  slug: string;
  tiers: TierRow[];
  sponsors: Sponsor[];
  uploads: boolean;
}) {
  const pending = sponsors.filter((s) => s.status === "PENDING");
  const rest = sponsors.filter((s) => s.status !== "PENDING");
  const tierOptions = tiers.map((t) => ({ id: t.id, name: t.name }));

  return (
    <UploadsContext value={uploads}>
      <div className="max-w-4xl space-y-10">
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Sponsorship levels</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The levels a brand can sponsor at, highest first. Anyone can send a request from{" "}
              <a href={`/events/${slug}/sponsor`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                /events/{slug}/sponsor
              </a>
              . Nothing appears on the event page until you approve it.
            </p>
          </div>
          {tiers.map((t, i) => (
            <TierForm
              key={`${t.id}-${t.name}-${t.price}-${t.slots}-${t.benefits}-${t.showInHero}-${t.active}`}
              eventId={eventId}
              tier={t}
              position={{ first: i === 0, last: i === tiers.length - 1 }}
            />
          ))}
          <h3 className="pt-2 text-sm font-semibold">Add a level</h3>
          <TierForm eventId={eventId} tier={null} />
        </section>

        {tiers.length > 0 && (
          <>
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">
                Requests to review{" "}
                <Badge variant="outline" className="ml-1 align-middle">
                  {pending.length}
                </Badge>
              </h2>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sponsorship requests are waiting.</p>
              ) : (
                pending.map((s) => (
                  <SponsorForm
                    key={`${s.id}-${s.status}-${s.tierId}-${s.logoUrl}-${s.website}-${s.paid}-${s.companyName}`}
                    eventId={eventId}
                    sponsor={s}
                    tiers={tierOptions}
                  />
                ))
              )}
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Sponsors</h2>
              {rest.length === 0 && (
                <p className="text-sm text-muted-foreground">No sponsors yet.</p>
              )}
              {rest.map((s) => (
                <SponsorForm
                  key={`${s.id}-${s.status}-${s.tierId}-${s.logoUrl}-${s.website}-${s.paid}-${s.companyName}`}
                  eventId={eventId}
                  sponsor={s}
                  tiers={tierOptions}
                />
              ))}
              <h3 className="pt-2 text-sm font-semibold">Add a sponsor yourself</h3>
              <SponsorForm eventId={eventId} sponsor={null} tiers={tierOptions} />
            </section>
          </>
        )}
      </div>
    </UploadsContext>
  );
}
