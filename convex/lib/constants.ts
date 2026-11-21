import { v } from "convex/values";

// Shared by Convex functions and the Next.js UI so the two can never drift apart.

export const CATEGORIES = [
  { value: "power_tools", label: "Power tools" },
  { value: "hand_tools", label: "Hand tools" },
  { value: "garden", label: "Garden" },
  { value: "kitchen", label: "Kitchen" },
  { value: "camping", label: "Camping" },
  { value: "cleaning", label: "Cleaning" },
  { value: "ladders", label: "Ladders & access" },
  { value: "other", label: "Other" },
] as const;

export const CONDITIONS = [
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "worn", label: "Well used" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];
export type Condition = (typeof CONDITIONS)[number]["value"];

export const categoryValidator = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("ladders"),
  v.literal("other"),
);

export const conditionValidator = v.union(
  v.literal("like_new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);

export const loanStatusValidator = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);
export type LoanStatus = "requested" | "approved" | "declined" | "cancelled" | "returned";

/** Events that trigger the n8n "request notification" workflow. */
export const loanEventValidator = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
  v.literal("tool_removed"),
);
export type LoanEvent = "requested" | "approved" | "declined" | "cancelled" | "returned" | "tool_removed";

export const LIMITS = {
  toolName: { min: 2, max: 60 },
  description: { min: 0, max: 500 },
  note: { min: 0, max: 300 },
  maxLoanDays: 30,
  maxDaysAhead: 90,
} as const;

export function labelFor(list: readonly { value: string; label: string }[], value: string) {
  return list.find((x) => x.value === value)?.label ?? value;
}
