/** Date-range helpers for the report pages. All dates are local "YYYY-MM-DD". */

export type PresetKey = "today" | "week" | "month" | "lastMonth" | "last28" | "year";

export interface DateRange {
  start: string;
  end: string;
}

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "今天" },
  { key: "week", label: "本週" },
  { key: "month", label: "本月" },
  { key: "lastMonth", label: "上月" },
  { key: "last28", label: "近 28 天" },
  { key: "year", label: "今年" },
];

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function presetRange(key: PresetKey, today = new Date()): DateRange {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (key) {
    case "today":
      return { start: toISODate(t), end: toISODate(t) };
    case "week": {
      // Weeks start on Monday, matching the backend's weekly buckets.
      const offset = (t.getDay() + 6) % 7;
      return { start: toISODate(addDays(t, -offset)), end: toISODate(t) };
    }
    case "month":
      return { start: toISODate(new Date(t.getFullYear(), t.getMonth(), 1)), end: toISODate(t) };
    case "lastMonth":
      return {
        start: toISODate(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
        end: toISODate(new Date(t.getFullYear(), t.getMonth(), 0)),
      };
    case "year":
      return { start: toISODate(new Date(t.getFullYear(), 0, 1)), end: toISODate(t) };
    case "last28":
    default:
      return { start: toISODate(addDays(t, -27)), end: toISODate(t) };
  }
}

/** Which preset (if any) the given range corresponds to. */
export function matchPreset(range: DateRange): PresetKey | null {
  for (const preset of PRESETS) {
    const r = presetRange(preset.key);
    if (r.start === range.start && r.end === range.end) return preset.key;
  }
  return null;
}

/** The period of equal length immediately before the given range. */
export function previousRange(range: DateRange): DateRange {
  const start = fromISODate(range.start);
  const end = fromISODate(range.end);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const prevEnd = addDays(start, -1);
  return { start: toISODate(addDays(prevEnd, -(days - 1))), end: toISODate(prevEnd) };
}

/** "20261005-20261101" for export file names. */
export function rangeSlug(range: DateRange): string {
  return `${range.start.replaceAll("-", "")}-${range.end.replaceAll("-", "")}`;
}

/** "2026/10/05 – 2026/11/01" */
export function rangeLabel(range: DateRange): string {
  return `${range.start.replaceAll("-", "/")} – ${range.end.replaceAll("-", "/")}`;
}

/** Percent change, or null when the previous value is zero. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
}
