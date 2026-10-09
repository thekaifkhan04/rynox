import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConfigCheck } from "@/lib/config-check";

const look = {
  ok: { Icon: CircleCheck, tone: "text-emerald-400", label: "Ready" },
  warning: { Icon: CircleAlert, tone: "text-amber-300", label: "Check" },
  missing: { Icon: CircleX, tone: "text-red-400", label: "Not set" },
};

/** What the site still needs before it can go live. */
export function SetupStatus({ checks }: { checks: ConfigCheck[] }) {
  const missing = checks.filter((c) => c.state === "missing").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Setup
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {missing === 0
              ? "Everything required is configured."
              : `${missing} required setting${missing === 1 ? "" : "s"} still to do before going live.`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {checks.map((c) => {
            const { Icon, tone, label } = look[c.state];
            return (
              <li key={c.name} className="flex gap-3">
                <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden />
                <div>
                  <p className="text-sm font-medium">
                    {c.name} <span className={`ml-1 text-xs font-normal ${tone}`}>{label}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{c.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
