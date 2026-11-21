import { ConvexError } from "convex/values";

/** Today in UTC (YYYY-MM-DD). The backend uses UTC for all loan dates too. */
export function todayUtc(now: number = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

export function formatDate(iso: string) {
  return dateFmt.format(new Date(`${iso}T00:00:00Z`));
}

export function formatRange(start: string, end: string) {
  return start === end ? formatDate(start) : `${formatDate(start)} to ${formatDate(end)}`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "2 days ago", "yesterday", "just now". */
export function relativeTime(ts: number, now: number = Date.now()) {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

export function isOverdue(status: string, endDate: string, today = todayUtc()) {
  return status === "approved" && endDate < today;
}

/** "Due back in 2 days" / "Due back today" / "3 days overdue" for an active loan. */
export function dueLabel(endDate: string, today = todayUtc()): { text: string; overdue: boolean } {
  const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { text: `${-days} day${days === -1 ? "" : "s"} overdue`, overdue: true };
  if (days === 0) return { text: "Due back today", overdue: false };
  if (days === 1) return { text: "Due back tomorrow", overdue: false };
  return { text: `Due back in ${days} days`, overdue: false };
}

/** Turns a ConvexError thrown by our guards into the human message it carries. */
export function errorMessage(e: unknown): string {
  if (e instanceof ConvexError) {
    const data = e.data as { message?: string } | string;
    if (typeof data === "string") return data;
    if (data?.message) return data.message;
  }
  return "Something went wrong. Please try again.";
}
