"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex grow flex-col items-center justify-center px-5 py-24 text-center">
      <h1 className="display text-4xl">Something went wrong</h1>
      <p className="mt-3 max-w-md text-white/70">
        The page could not be loaded. If you were paying, your order is safe: refresh in a moment
        and check My tickets before trying again.
      </p>
      <Button type="button" size="xl" onClick={reset} className="mt-6">
        Try again
      </Button>
    </main>
  );
}
