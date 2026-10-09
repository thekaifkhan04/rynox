"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { sponsorApplyAction } from "@/app/actions/registration";
import { SimpleSelect } from "@/components/simple-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function SponsorForm({
  eventId,
  slug,
  eventTitle,
  levels,
  defaultLevelId,
  user,
}: {
  eventId: string;
  slug: string;
  eventTitle: string;
  levels: { id: string; label: string; disabled: boolean }[];
  defaultLevelId: string;
  user: { name: string; email: string };
}) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({
    tierId: defaultLevelId,
    companyName: "",
    contactName: user.name,
    email: user.email,
    phone: "",
    website: "",
    logoUrl: "",
    message: "",
  });
  const text = (key: keyof typeof v) => ({
    id: `sponsor-${key}`,
    value: v[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((prev) => ({ ...prev, [key]: e.target.value })),
  });

  if (sent) {
    return (
      <Alert className="p-6">
        <CircleCheck className="size-6! text-emerald-400" aria-hidden />
        <AlertTitle className="text-xl">Request sent</AlertTitle>
        <AlertDescription className="text-base">
          Thank you. The organisers of {eventTitle} will review your request and contact you at{" "}
          {v.email}. Your brand appears on the event page once they approve it.
          <Button asChild size="xl" className="mt-5 flex w-fit">
            <Link href={`/events/${slug}`}>Back to the event</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="rounded-none [--card-spacing:--spacing(6)]">
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const res = await sponsorApplyAction({ eventId, ...v });
              if (res.ok) setSent(true);
              else {
                setError(res.error);
                toast.error(res.error);
              }
            });
          }}
        >
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="sponsor-level">Sponsorship level</Label>
            <SimpleSelect
              id="sponsor-level"
              value={v.tierId}
              onValueChange={(tierId) => setV((prev) => ({ ...prev, tierId }))}
              options={levels.map((l) => ({ value: l.id, label: l.label, disabled: l.disabled }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sponsor-companyName">Company or brand name</Label>
            <Input {...text("companyName")} required minLength={2} autoComplete="organization" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sponsor-contactName">Your name</Label>
            <Input {...text("contactName")} required minLength={2} autoComplete="name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sponsor-email">Email</Label>
            <Input {...text("email")} type="email" required autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sponsor-phone">Phone number</Label>
            <Input {...text("phone")} type="tel" required inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sponsor-website">
              Website <span className="text-white/50">(optional)</span>
            </Label>
            <Input {...text("website")} type="url" placeholder="https://" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sponsor-logoUrl">
              Link to your logo <span className="text-white/50">(optional)</span>
            </Label>
            <Input {...text("logoUrl")} type="url" placeholder="https://…/logo.png" />
            <p className="text-xs text-white/50">
              A PNG or SVG on a transparent background works best. You can also send it to the
              organisers later.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sponsor-message">
              Anything the organisers should know <span className="text-white/50">(optional)</span>
            </Label>
            <Textarea {...text("message")} rows={4} maxLength={2000} />
          </div>
          {error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" variant="accent" size="xl" disabled={pending} className="h-12">
              {pending ? "Sending…" : "Send sponsorship request"}
            </Button>
            <p className="mt-3 text-xs text-white/50">
              No payment is taken now. The organisers confirm the details and payment with you
              directly.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
