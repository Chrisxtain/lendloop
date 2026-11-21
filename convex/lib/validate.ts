import { fail } from "./auth";
import { LIMITS } from "./constants";

/** Trims, collapses runs of spaces (not newlines) and enforces length bounds. */
export function cleanText(value: string, field: string, bounds: { min: number; max: number }): string {
  const text = value.trim().replace(/[ \t]+/g, " ");
  if (text.length < bounds.min) fail("INVALID", `${field} must be at least ${bounds.min} characters.`);
  if (text.length > bounds.max) fail("INVALID", `${field} must be at most ${bounds.max} characters.`);
  return text;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Today's date in UTC as YYYY-MM-DD. Only call from mutations/actions (queries can't read the clock). */
export function todayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export function validateLoanDates(startDate: string, endDate: string, today: string) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) fail("INVALID", "Dates must be valid (YYYY-MM-DD).");
  if (startDate < today) fail("INVALID", "The start date can't be in the past.");
  if (endDate < startDate) fail("INVALID", "The return date must be on or after the start date.");
  if (daysBetween(startDate, endDate) + 1 > LIMITS.maxLoanDays) {
    fail("INVALID", `Loans can be at most ${LIMITS.maxLoanDays} days.`);
  }
  if (daysBetween(today, startDate) > LIMITS.maxDaysAhead) {
    fail("INVALID", `Requests can start at most ${LIMITS.maxDaysAhead} days ahead.`);
  }
}
