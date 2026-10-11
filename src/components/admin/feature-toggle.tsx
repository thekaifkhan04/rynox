"use client";

import { Star } from "lucide-react";
import { setFeaturedEventAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { useAction } from "./use-action";

/** Puts an event at the top of the home page, or takes it back off. */
export function FeatureToggle({
  eventId,
  title,
  featured,
  size = "default",
}: {
  eventId: string;
  title: string;
  featured: boolean;
  size?: "default" | "sm";
}) {
  const { pending, run } = useAction();
  return (
    <Button
      type="button"
      size={size}
      variant={featured ? "secondary" : "outline"}
      disabled={pending}
      aria-pressed={featured}
      onClick={() =>
        run(() => setFeaturedEventAction(featured ? null : eventId), {
          success: featured
            ? "The home page now shows the next upcoming event"
            : `${title} now leads the home page`,
        })
      }
    >
      <Star className={featured ? "fill-current text-amber-300" : ""} />
      {featured ? "On the home page" : "Show on home page"}
    </Button>
  );
}
