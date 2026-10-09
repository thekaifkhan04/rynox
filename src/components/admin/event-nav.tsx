"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabs = [
  { href: "", label: "Details" },
  { href: "/competitions", label: "Competitions" },
  { href: "/tickets", label: "Ticket types" },
  { href: "/form", label: "Registration form" },
  { href: "/landing", label: "Landing page" },
  { href: "/sponsors", label: "Sponsors" },
  { href: "/registrations", label: "Registrations" },
  { href: "/progress", label: "Levels & results" },
  { href: "/check-in", label: "Check-in" },
];

export function EventNav({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const base = `/admin/events/${eventId}`;
  return (
    <nav aria-label="Event sections" className="overflow-x-auto border-b border-white/10 pb-1">
      {/* Each tab is a link, so the active tab simply follows the URL. */}
      <Tabs value={pathname.startsWith(`${base}/registrations`) ? `${base}/registrations` : pathname}>
        <TabsList variant="line">
          {tabs.map((t) => (
            <TabsTrigger key={t.href} value={base + t.href} asChild className="px-3">
              <Link href={base + t.href}>{t.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  );
}
