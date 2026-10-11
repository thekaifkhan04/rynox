import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export function formatDate(d: Date, tz: string) {
  return formatInTimeZone(d, tz, "d MMM yyyy");
}

export function formatDateTime(d: Date, tz: string) {
  return formatInTimeZone(d, tz, "d MMM yyyy, h:mm a");
}

export function formatTime(d: Date, tz: string) {
  return formatInTimeZone(d, tz, "h:mm a");
}

/** "12 — 14 March 2027" or "12 March 2027" for a single-day event. */
export function formatDateRange(start: Date, end: Date, tz: string) {
  const sameDay =
    formatInTimeZone(start, tz, "yyyy-MM-dd") === formatInTimeZone(end, tz, "yyyy-MM-dd");
  if (sameDay) return formatInTimeZone(start, tz, "d MMMM yyyy");
  const sameMonth =
    formatInTimeZone(start, tz, "yyyy-MM") === formatInTimeZone(end, tz, "yyyy-MM");
  if (sameMonth) {
    return `${formatInTimeZone(start, tz, "d")} – ${formatInTimeZone(end, tz, "d MMMM yyyy")}`;
  }
  return `${formatInTimeZone(start, tz, "d MMM")} – ${formatInTimeZone(end, tz, "d MMM yyyy")}`;
}

/** Value for <input type="datetime-local"> in the event's timezone. */
export function toLocalInput(d: Date | null | undefined, tz: string) {
  return d ? formatInTimeZone(d, tz, "yyyy-MM-dd'T'HH:mm") : "";
}

/** Parse a datetime-local value as wall-clock time in the event's timezone. */
export function fromLocalInput(value: string, tz: string): Date | null {
  if (!value) return null;
  const d = fromZonedTime(value, tz);
  return Number.isNaN(d.getTime()) ? null : d;
}
