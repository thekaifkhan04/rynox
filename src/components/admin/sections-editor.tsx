"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  addSectionAction,
  deleteSectionAction,
  moveSectionAction,
  saveSectionAction,
  setSectionVisibleAction,
} from "@/app/actions/admin";
import { ConfirmButton } from "@/components/confirm-button";
import { SimpleSelect } from "@/components/simple-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { EventSection } from "@/db/schema";
import {
  isSectionType,
  SECTION_TYPES,
  SECTIONS,
  type FieldDef,
  type SectionType,
} from "@/sections/registry";
import { ImageInput, UploadsContext } from "./image-input";
import { useAction } from "./use-action";

type Content = Record<string, unknown>;

function blankItem(fields: FieldDef[]): Content {
  return Object.fromEntries(
    fields.map((f) => [f.key, f.kind === "boolean" ? false : f.kind === "list" ? [] : ""]),
  );
}

/** Renders the editor for one field of a section, driven by its definition. */
function FieldEditor({
  def,
  value,
  onChange,
  idPrefix,
}: {
  def: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  idPrefix: string;
}) {
  const id = `${idPrefix}-${def.key}`;

  if (def.kind === "list") {
    const items = Array.isArray(value) ? (value as Content[]) : [];
    const setItem = (i: number, item: Content) => onChange(items.map((x, j) => (j === i ? item : x)));
    const swap = (i: number, j: number) => {
      const next = [...items];
      [next[i], next[j]] = [next[j], next[i]];
      onChange(next);
    };
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{def.label}</p>
        {items.map((item, i) => (
          <Card key={i} size="sm" className="bg-background/60">
            <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                {def.itemLabel} {i + 1}
              </span>
              <div className="flex gap-0.5">
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => swap(i, i - 1)}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === items.length - 1} onClick={() => swap(i, i + 1)}>
                  <ArrowDown />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${def.itemLabel} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            </div>
            {def.fields.map((f) => (
              <FieldEditor
                key={f.key}
                def={f}
                idPrefix={`${id}-${i}`}
                value={item[f.key]}
                onChange={(v) => setItem(i, { ...item, [f.key]: v })}
              />
            ))}
            </CardContent>
          </Card>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, blankItem(def.fields)])}>
          <Plus /> Add {def.itemLabel.toLowerCase()}
        </Button>
      </div>
    );
  }

  if (def.kind === "boolean") {
    return (
      <Label className="flex items-center gap-2 text-sm font-normal">
        <Switch checked={value === true} onCheckedChange={onChange} />
        {def.label}
      </Label>
    );
  }

  const text = typeof value === "string" ? value : "";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{def.label}</Label>
      {def.kind === "select" ? (
        <SimpleSelect id={id} value={text} onValueChange={onChange} options={def.options} />
      ) : def.kind === "image" ? (
        <ImageInput id={id} value={text} onChange={onChange} />
      ) : def.kind === "textarea" || def.kind === "markdown" ? (
        <Textarea id={id} rows={def.kind === "markdown" ? 6 : 3} value={text} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input
          id={id}
          type={def.kind === "url" ? "url" : "text"}
          placeholder={def.placeholder}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {def.kind === "markdown" && (
        <p className="text-xs text-muted-foreground">
          Formatting: **bold**, *italic*, lists starting with “- ”, and [links](https://…).
        </p>
      )}
      {"help" in def && def.help && <p className="text-xs text-muted-foreground">{def.help}</p>}
    </div>
  );
}

function SectionCard({
  eventId,
  section,
  type,
  position,
  open,
  onToggle,
  onChanged,
}: {
  eventId: string;
  section: EventSection;
  type: SectionType;
  position: { first: boolean; last: boolean };
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const def = SECTIONS[type];
  const { pending, run } = useAction();
  const [content, setContent] = useState<Content>(section.content);
  const [dirty, setDirty] = useState(false);
  const heading = typeof content.heading === "string" && content.heading ? content.heading : null;

  return (
    <li>
      <Card className={`gap-0 py-0 ${section.visible ? "" : "border border-dashed border-white/15 opacity-70 ring-0"}`}>
      <Collapsible open={open} onOpenChange={onToggle}>
      <div className="flex items-center gap-1 p-2 pl-1">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" className="h-9 min-w-0 grow justify-start gap-2 px-2">
            <ChevronDown className={`transition ${open ? "" : "-rotate-90"}`} aria-hidden />
            <span className="font-semibold">{def.label}</span>
            {heading && <span className="truncate text-sm font-normal text-muted-foreground">{heading}</span>}
            {dirty && <span className="text-xs text-amber-300">Unsaved</span>}
          </Button>
        </CollapsibleTrigger>
        <Switch
          aria-label={`Show ${def.label} on the page`}
          checked={section.visible}
          disabled={pending}
          onCheckedChange={(visible) =>
            run(() => setSectionVisibleAction(eventId, section.id, visible), { onSuccess: onChanged })
          }
        />
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Move section up" disabled={pending || position.first}
          onClick={() => run(() => moveSectionAction(eventId, section.id, "up"), { onSuccess: onChanged })}>
          <ArrowUp />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Move section down" disabled={pending || position.last}
          onClick={() => run(() => moveSectionAction(eventId, section.id, "down"), { onSuccess: onChanged })}>
          <ArrowDown />
        </Button>
        <ConfirmButton
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${def.label} section`}
          disabled={pending}
          title={`Delete this ${def.label} section?`}
          description="The section and its content are removed from the landing page. To take it off the page but keep the content, hide it instead."
          confirmLabel="Delete section"
          onConfirm={() =>
            run(() => deleteSectionAction(eventId, section.id), { success: "Section deleted", onSuccess: onChanged })
          }
        >
          <Trash2 />
        </ConfirmButton>
      </div>
      <CollapsibleContent>
        <form
          data-section-form
          className="space-y-4 border-t border-white/10 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveSectionAction(eventId, section.id, content), {
              success: "Section saved",
              onSuccess: () => {
                setDirty(false);
                onChanged();
              },
            });
          }}
        >
          <p className="text-xs text-muted-foreground">{def.description}</p>
          {def.fields.map((f) => (
            <FieldEditor
              key={f.key}
              def={f}
              idPrefix={section.id}
              value={content[f.key]}
              onChange={(v) => {
                setContent((c) => ({ ...c, [f.key]: v }));
                setDirty(true);
              }}
            />
          ))}
          <Button type="submit" disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save section"}
          </Button>
        </form>
      </CollapsibleContent>
      </Collapsible>
      </Card>
    </li>
  );
}

export function SectionsEditor({
  eventId,
  slug,
  sections,
  uploads,
}: {
  eventId: string;
  slug: string;
  sections: EventSection[];
  uploads: boolean;
}) {
  const { pending, run } = useAction();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newType, setNewType] = useState<SectionType>("richtext");
  // Bumping the key reloads the preview after every saved change.
  const [previewKey, setPreviewKey] = useState(0);
  const reload = () => setPreviewKey((k) => k + 1);

  return (
    <UploadsContext value={uploads}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_1fr]">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The page always opens with the hero built from the event details. Add, reorder and
            edit the sections below it. Hidden sections stay here but are not shown to visitors.
          </p>
          <ul className="space-y-2">
            {sections.map((s, i) =>
              isSectionType(s.type) ? (
                <SectionCard
                  key={s.id}
                  eventId={eventId}
                  section={s}
                  type={s.type}
                  position={{ first: i === 0, last: i === sections.length - 1 }}
                  open={openId === s.id}
                  onToggle={() => setOpenId(openId === s.id ? null : s.id)}
                  onChanged={reload}
                />
              ) : null,
            )}
          </ul>
          {sections.length === 0 && (
            <Card className="border border-dashed border-white/15 bg-transparent ring-0">
              <CardContent className="text-center text-sm text-muted-foreground">
                No sections yet. Add one below.
              </CardContent>
            </Card>
          )}
          <Card size="sm">
            <CardContent className="flex gap-2">
            <Label htmlFor="new-section-type" className="sr-only">
              Section type
            </Label>
            <SimpleSelect
              id="new-section-type"
              value={newType}
              onValueChange={(t) => setNewType(t as SectionType)}
              options={SECTION_TYPES.map((t) => ({ value: t, label: SECTIONS[t].label }))}
            />
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => addSectionAction(eventId, newType), {
                  onSuccess: (res) => {
                    setOpenId(res.id);
                    reload();
                  },
                })
              }
            >
              <Plus /> Add section
            </Button>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">{SECTIONS[newType].description}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Preview</span>
            <Button asChild variant="link" className="h-auto p-0 text-muted-foreground">
              <a href={`/events/${slug}`} target="_blank" rel="noreferrer">
                Open in a new tab
              </a>
            </Button>
          </div>
          <iframe
            key={previewKey}
            src={`/events/${slug}`}
            title="Landing page preview"
            className="h-[80vh] w-full rounded-lg border border-white/10 bg-background"
          />
          <p className="text-xs text-muted-foreground">The preview updates each time you save.</p>
        </div>
      </div>
    </UploadsContext>
  );
}
