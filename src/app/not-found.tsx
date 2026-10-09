import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex grow flex-col items-center justify-center px-5 py-24 text-center">
      <p className="display text-8xl text-white/20">404</p>
      <h1 className="display mt-2 text-4xl">Page not found</h1>
      <p className="mt-3 text-white/70">
        The page may have moved, or you may need to sign in with the account that owns it.
      </p>
      <Button asChild size="xl" className="mt-6">
            <Link href="/">Back to events</Link>
          </Button>
    </main>
  );
}
