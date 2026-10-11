const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatPaise(paise: number) {
  return paise === 0 ? "Free" : inr.format(paise / 100);
}

export function formatAmount(paise: number) {
  return inr.format(paise / 100);
}

/** "499", "499.50" -> paise. Returns null when not a valid non-negative amount. */
export function rupeesToPaise(input: string | number): number | null {
  const n = typeof input === "number" ? input : Number(String(input).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
