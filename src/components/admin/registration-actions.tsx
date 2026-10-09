"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  cancelTicketsAction,
  checkInAction,
  resendTicketsAction,
  retryRefundAction,
  undoCheckInAction,
} from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatAmount } from "@/lib/money";
import { useAction } from "./use-action";

export function RegistrationActions({
  eventId,
  ticket,
}: {
  eventId: string;
  ticket: {
    id: string;
    orderId: string;
    code: string;
    name: string;
    status: "RESERVED" | "VALID" | "CANCELLED";
    checkedIn: boolean;
    pricePaise: number;
    offline: boolean;
  };
}) {
  const { pending, run } = useAction();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const valid = ticket.status === "VALID";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${ticket.name}`} disabled={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/orders/${ticket.orderId}`}>View order</Link>
          </DropdownMenuItem>
          {valid && (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/tickets/${ticket.code}`}>View ticket</Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => run(() => resendTicketsAction(ticket.orderId), { success: "Ticket email sent" })}
              >
                Resend ticket email
              </DropdownMenuItem>
              {ticket.checkedIn ? (
                <DropdownMenuItem
                  onSelect={() => run(() => undoCheckInAction(ticket.id), { success: "Check-in undone" })}
                >
                  Undo check-in
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={() => run(() => checkInAction(eventId, ticket.code), { success: "Checked in" })}
                >
                  Mark as checked in
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setCancelOpen(true)}>
                Cancel{ticket.pricePaise > 0 ? " and refund" : ""}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {ticket.name}&apos;s ticket?</DialogTitle>
            <DialogDescription>
              Ticket {ticket.code} stops working at the gate and its seat goes back on sale.{" "}
              {ticket.pricePaise === 0
                ? ""
                : ticket.offline
                  ? `This was paid offline, so return ${formatAmount(ticket.pricePaise)} to the buyer yourself. `
                  : `${formatAmount(ticket.pricePaise)} is refunded to the original payment method. `}
              The buyer is emailed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`reason-${ticket.id}`}>Reason (internal note, optional)</Label>
            <Textarea id={`reason-${ticket.id}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep ticket
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(() => cancelTicketsAction(ticket.orderId, [ticket.id], reason), {
                  onSuccess: (res) => {
                    setCancelOpen(false);
                    if (res.refundFailed) {
                      toast.warning(
                        "The ticket was cancelled, but Razorpay did not accept the refund. Use Retry refund at the top of this page.",
                        { duration: 12_000 },
                      );
                    }
                  },
                  success: "Ticket cancelled",
                })
              }
            >
              {pending ? "Cancelling…" : "Cancel ticket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RetryRefundButton({ refundId }: { refundId: string }) {
  const { pending, run } = useAction();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => run(() => retryRefundAction(refundId), { success: "Refund sent" })}
    >
      {pending ? "Retrying…" : "Retry refund"}
    </Button>
  );
}
