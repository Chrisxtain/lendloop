import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type EventKind = Doc<"automationEvents">["kind"];

/**
 * Idempotent write: the idempotencyKey is checked inside the same transaction as
 * the insert, and Convex mutations are serializable, so two concurrent retries
 * with the same key can never both insert.
 */
export async function recordAutomationEvent(
  ctx: MutationCtx,
  args: { loanId: Id<"loans">; kind: EventKind; idempotencyKey: string; detail?: string },
): Promise<"created" | "duplicate"> {
  const existing = await ctx.db
    .query("automationEvents")
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
    .first();
  if (existing) return "duplicate";
  await ctx.db.insert("automationEvents", { ...args, at: Date.now() });
  return "created";
}

export async function recordAutomationError(
  ctx: MutationCtx,
  args: { source: string; message: string; executionId?: string; idempotencyKey: string },
): Promise<"created" | "duplicate"> {
  const existing = await ctx.db
    .query("automationErrors")
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
    .first();
  if (existing) return "duplicate";
  await ctx.db.insert("automationErrors", { ...args, at: Date.now() });
  return "created";
}
