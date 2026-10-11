import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getUser } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";

const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? "RYNOX";

async function UserNav() {
  const user = await getUser();
  if (!user) {
    return (
      <Button asChild variant="hero" className="h-10 px-4">
        <Link href="/sign-in">Sign in</Link>
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {user.isAdmin && (
        <Button asChild variant="ghost" className="hidden h-10 px-3 font-semibold sm:inline-flex">
          <Link href="/admin">Admin</Link>
        </Button>
      )}
      <SignOutButton className="hidden h-10 px-3 font-semibold text-white/70 sm:inline-flex" />
      <Button asChild variant="hero" className="ml-2 h-10 px-4">
        <Link href="/tickets">My tickets</Link>
      </Button>
    </div>
  );
}

/** `overlay` sits transparently on top of a hero image. */
export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <header
      className={
        overlay ? "absolute inset-x-0 top-0 z-20" : "border-b border-white/10 bg-background"
      }
    >
      <div className="container-page flex h-20 items-center justify-between gap-4">
        <Link href="/" className="display text-2xl sm:text-3xl">
          {siteName}
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-3">
          <Button asChild variant="ghost" className="h-10 px-3 font-semibold sm:text-base">
            <Link href="/events">Events</Link>
          </Button>
          <Suspense fallback={<span className="h-10 w-24" />}>
            <UserNav />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto pb-10 text-center">
      <Separator className="mb-10" />
      <p className="display text-3xl">{siteName}</p>
      <p className="mt-3 text-sm text-white/50">
        Tests of stamina, strength and endurance. © {siteName}
      </p>
    </footer>
  );
}
