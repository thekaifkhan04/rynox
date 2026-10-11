import { Badge } from "@/components/ui/badge";
import type { Event } from "@/db/schema";

const styles: Record<Event["status"], string> = {
  DRAFT: "border-white/20 bg-white/5 text-white/70",
  PUBLISHED: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  CLOSED: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  CANCELLED: "border-red-400/40 bg-red-400/10 text-red-300",
};

const labels: Record<Event["status"], string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CLOSED: "Registration closed",
  CANCELLED: "Cancelled",
};

export function EventStatusBadge({ status }: { status: Event["status"] }) {
  return (
    <Badge variant="outline" className={styles[status]}>
      {labels[status]}
    </Badge>
  );
}
