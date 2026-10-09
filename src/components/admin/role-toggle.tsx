"use client";

import { setUserRoleAction } from "@/app/actions/admin";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { useAction } from "./use-action";

export function RoleToggle({ userId, isAdmin, name }: { userId: string; isAdmin: boolean; name: string }) {
  const { pending, run } = useAction();
  if (!isAdmin) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => setUserRoleAction(userId, "ADMIN"), { success: `${name} is now an admin` })}
      >
        Make admin
      </Button>
    );
  }
  return (
    <ConfirmButton
      size="sm"
      variant="destructive"
      disabled={pending}
      title={`Remove admin access from ${name}?`}
      description="They will no longer be able to manage events, registrations, refunds or check-in."
      confirmLabel="Remove admin"
      onConfirm={() => run(() => setUserRoleAction(userId, "USER"), { success: "Admin access removed" })}
    >
      Remove admin
    </ConfirmButton>
  );
}
