"use client";

import { createContext, use, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Whether the server has blob storage configured for uploads. */
export const UploadsContext = createContext(false);

export function ImageInput({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const uploads = use(UploadsContext);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
      onChange(data.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      {value ? (
        <img src={value} alt="" className="size-9 shrink-0 rounded-md border border-white/15 object-cover" />
      ) : (
        <div className="size-9 shrink-0 rounded-md border border-dashed border-white/20" aria-hidden />
      )}
      <Input
        id={id}
        type="url"
        inputMode="url"
        placeholder="https://… image link"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {uploads && (
        <>
          <Input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload /> {busy ? "Uploading…" : "Upload"}
          </Button>
        </>
      )}
    </div>
  );
}
