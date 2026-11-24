import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Booking rules. A tool can have several approved loans ("bookings") as long as
 * their date ranges don't overlap. It shows as "on loan" only while one of them
 * has started (startDate <= today); future bookings leave it available.
 */

type Range = { startDate: string; endDate: string };

/** Inclusive date ranges overlap. Dates are YYYY-MM-DD, so string comparison is chronological. */
export function overlaps(a: Range, b: Range): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export async function approvedLoansForTool(ctx: Pick<QueryCtx, "db">, toolId: Id<"tools">): Promise<Doc<"loans">[]> {
  return ctx.db
    .query("loans")
    .withIndex("by_toolId_and_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .take(100);
}

/** The first approved booking that clashes with `range`, if any (optionally ignoring one loan). */
export async function findClash(
  ctx: Pick<QueryCtx, "db">,
  toolId: Id<"tools">,
  range: Range,
  ignore?: Id<"loans">,
): Promise<Doc<"loans"> | null> {
  const booked = await approvedLoansForTool(ctx, toolId);
  return booked.find((l) => l._id !== ignore && overlaps(l, range)) ?? null;
}

/** Recomputes tools.status from its approved bookings. Call after any change to a tool's loans. */
export async function syncToolStatus(ctx: MutationCtx, toolId: Id<"tools">, today: string): Promise<void> {
  const tool = await ctx.db.get("tools", toolId);
  if (!tool) return;
  const started = (await approvedLoansForTool(ctx, toolId)).some((l) => l.startDate <= today);
  const status = started ? "on_loan" : "available";
  if (tool.status !== status) await ctx.db.patch("tools", toolId, { status });
}

export function describeRange(r: Range): string {
  return r.startDate === r.endDate ? r.startDate : `${r.startDate} to ${r.endDate}`;
}
