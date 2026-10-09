import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <>
      <SiteHeader />
      <main className="container-page flex grow items-center justify-center py-16 text-center">
        <div>
          <h1 className="display text-5xl">Organisers only</h1>
          <p className="mt-4 text-white/70">
            This area is for event organisers. Your account does not have admin access.
          </p>
          <Button asChild size="xl" className="mt-6">
            <Link href="/">Back to events</Link>
          </Button>
        </div>
      </main>
    </>
  );
}
