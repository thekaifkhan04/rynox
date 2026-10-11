"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [
    { label: "Days", value: Math.floor(s / 86400) },
    { label: "Hours", value: Math.floor((s % 86400) / 3600) },
    { label: "Minutes", value: Math.floor((s % 3600) / 60) },
    { label: "Seconds", value: s % 60 },
  ];
}

/** A number that rolls to its next value instead of snapping. */
function Rolling({ text }: { text: string }) {
  return (
    <span className="relative inline-flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          initial={{ y: "60%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-60%", opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Ticks once a second after mount; null until then so server and client render the same. */
function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * The compact countdown shown in an event's hero. It disappears once the
 * event has started.
 */
export function HeroCountdown({
  target,
  className,
  compact = false,
}: {
  target: string;
  className?: string;
  /** A smaller version for cards. */
  compact?: boolean;
}) {
  const now = useNow();
  const remaining = now == null ? null : new Date(target).getTime() - now;
  if (remaining != null && remaining <= 0) return null;
  const items = parts(remaining ?? 0);
  return (
    <div
      role="timer"
      aria-live="off"
      aria-label="Time until the event starts"
      className={`inline-flex items-stretch divide-x divide-white/20 rounded-xl border border-white/25 bg-black/35 backdrop-blur-sm ${className ?? ""}`}
    >
      {items.map((p) => (
        <div
          key={p.label}
          className={
            compact
              ? "min-w-14 flex-1 px-2 py-2.5 text-center"
              : "min-w-17 px-3 py-3 text-center sm:min-w-24 sm:px-5 sm:py-4"
          }
        >
          <div className={`font-extrabold tabular-nums ${compact ? "text-2xl" : "text-3xl sm:text-5xl"}`}>
            {now == null ? "--" : <Rolling text={String(p.value).padStart(2, "0")} />}
          </div>
          <div
            className={`mt-1 font-semibold text-white/70 uppercase ${
              compact ? "text-[0.6rem] tracking-[0.15em]" : "text-[0.65rem] tracking-[0.2em] sm:text-xs"
            }`}
          >
            {p.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Countdown({ target, label }: { target: string; label: string }) {
  const now = useNow();

  const remaining = now == null ? null : new Date(target).getTime() - now;
  const items = parts(remaining ?? 0);
  const over = remaining != null && remaining <= 0;

  return (
    <div className="mx-auto grid max-w-4xl border-2 border-white sm:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]">
      <div className="flex items-center bg-white px-6 py-6 text-background sm:justify-end sm:px-8 sm:text-right">
        <p className="text-2xl leading-tight font-bold sm:text-3xl">{label}</p>
      </div>
      <div
        className="grid grid-cols-4 items-center px-3 py-6 sm:px-6"
        role="timer"
        aria-live="off"
        aria-label={label}
      >
        {over ? (
          <p className="display col-span-4 text-center text-4xl">It&apos;s on</p>
        ) : (
          items.map((p, i) => (
            <div key={p.label} className="relative text-center">
              {i > 0 && (
                <span aria-hidden className="absolute top-1 -left-1 text-3xl font-bold sm:text-5xl">
                  :
                </span>
              )}
              <div className="text-4xl font-extrabold tabular-nums sm:text-6xl">
                {now == null ? "--" : <Rolling text={String(p.value).padStart(2, "0")} />}
              </div>
              <div className="mt-1 text-xs text-white/70 sm:text-lg">{p.label}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
