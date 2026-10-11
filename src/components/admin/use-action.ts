"use client";

import { useTransition } from "react";
import { toast } from "sonner";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Run a server action with a pending flag and toast feedback. */
export function useAction() {
  const [pending, startTransition] = useTransition();
  function run<R extends ActionResult>(
    action: () => Promise<R>,
    opts: { success?: string; onSuccess?: (res: Extract<R, { ok: true }>) => void } = {},
  ) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(res as Extract<R, { ok: true }>);
    });
  }
  return { pending, run };
}
