"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  confirmPaymentAction,
  simulatePaymentAction,
  startPaymentAction,
} from "@/app/actions/registration";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/money";

type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      close?: () => void;
      on: (event: string, cb: (res: { error?: { description?: string } }) => void) => void;
    };
  }
}

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function TimeLeft({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setLeft(ms);
      if (ms <= 0) onExpire();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);
  if (left == null || left <= 0) return null;
  const s = Math.floor(left / 1000);
  return (
    <p className="text-sm text-white/70">
      Seats held for{" "}
      <span className="font-mono font-semibold text-white">
        {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
      </span>
    </p>
  );
}

export function PayButton({
  orderId,
  amountPaise,
  expiresAt,
  eventTitle,
  siteName,
  accent,
  buyer,
}: {
  orderId: string;
  amountPaise: number;
  expiresAt: string;
  eventTitle: string;
  siteName: string;
  accent: string;
  buyer: { name: string; email: string; phone: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [verifying, setVerifying] = useState(false);

  // While the payment is being confirmed, keep checking the order. If Razorpay's
  // own notification confirms it first, the page moves on without waiting.
  useEffect(() => {
    if (!verifying) return;
    const id = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(id);
  }, [verifying, router]);

  function finish(res: { ok: true } | { ok: false; error: string }) {
    if (res.ok) toast.success("Payment confirmed. Your ticket is ready.");
    else toast.error(res.error);
    setVerifying(false);
    router.refresh();
  }

  function pay() {
    startTransition(async () => {
      const start = await startPaymentAction(orderId);
      if (!start.ok) {
        toast.error(start.error);
        router.refresh();
        return;
      }
      if (start.checkout.mode === "mock") {
        finish(await simulatePaymentAction(orderId));
        return;
      }
      if (!(await loadCheckout()) || !window.Razorpay) {
        toast.error("Could not load the payment window. Check your connection and try again.");
        return;
      }
      const { keyId, razorpayOrderId, currency } = start.checkout;
      const checkout = new window.Razorpay({
        key: keyId,
        order_id: razorpayOrderId,
        amount: start.checkout.amountPaise,
        currency,
        name: siteName,
        description: eventTitle,
        prefill: { name: buyer.name, email: buyer.email, contact: buyer.phone },
        theme: { color: accent },
        handler: async (response: RazorpayResponse) => {
          // Payment is done: put Razorpay's window away and say what is happening.
          checkout.close?.();
          setVerifying(true);
          finish(await confirmPaymentAction(response));
        },
      });
      checkout.on("payment.failed", (res) => {
        toast.error(res.error?.description ?? "Payment failed. You can try again.");
      });
      checkout.open();
    });
  }

  if (verifying) {
    return (
      <Alert className="max-w-2xl border-emerald-400/40 p-5">
        <LoaderCircle className="size-6! animate-spin text-emerald-400" aria-hidden />
        <AlertTitle className="text-lg">Payment received</AlertTitle>
        <AlertDescription className="text-base">
          Getting your ticket ready. This takes a few seconds; please keep this page open.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        variant="accent"
        size="2xl"
        onClick={pay}
        disabled={pending}
        className="w-full sm:w-auto sm:px-10"
      >
        {pending ? "Opening secure payment…" : `Pay ${formatAmount(amountPaise)}`}
      </Button>
      <TimeLeft expiresAt={expiresAt} onExpire={router.refresh} />
    </div>
  );
}
