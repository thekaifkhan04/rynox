import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";

export const metadata = { title: { default: "Admin", template: "%s · Admin" } };

const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? "RYNOX";

// Access control lives in each page, route handler and server action
// (requireAdmin / assertAdmin), next to the data, not in this layout.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/admin" className="display text-xl">
            {siteName} <span className="text-white/50">admin</span>
          </Link>
          <nav aria-label="Admin" className="flex items-center gap-1">
            {[
              ["/admin", "Dashboard"],
              ["/admin/events", "Events"],
              ["/admin/payments", "Payments"],
              ["/admin/users", "Users"],
              ["/admin/ai", "AI access"],
            ].map(([href, label]) => (
              <Button key={href} asChild variant="ghost" className="text-white/75">
                <Link href={href}>{label}</Link>
              </Button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" className="text-white/60">
              <Link href="/">View site</Link>
            </Button>
            <SignOutButton className="text-white/60" />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl grow px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
