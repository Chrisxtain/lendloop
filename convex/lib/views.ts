import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Shapes returned to the browser. Data minimisation: other people's emails and
 * internal IDs are never sent; only a display name (and the Trusted Lender badge).
 */

type ReadCtx = Pick<QueryCtx, "db">;

export async function publicName(ctx: ReadCtx, userId: Id<"users">) {
  const u = await ctx.db.get("users", userId);
  return { name: u?.name ?? "Former member", trustedLender: u?.trustedLender ?? false };
}

export async function recentAutomation(ctx: ReadCtx, loanId: Id<"loans">) {
  const events = await ctx.db
    .query("automationEvents")
    .withIndex("by_loanId", (q) => q.eq("loanId", loanId))
    .order("desc")
    .take(3);
  return events.map((e) => ({ kind: e.kind, detail: e.detail ?? null, at: e.at }));
}

export async function loanView(ctx: ReadCtx, loan: Doc<"loans">, viewerId: Id<"users">) {
  const isOwner = loan.ownerId === viewerId;
  const other = await publicName(ctx, isOwner ? loan.borrowerId : loan.ownerId);
  return {
    _id: loan._id,
    toolName: loan.toolName,
    startDate: loan.startDate,
    endDate: loan.endDate,
    note: loan.note ?? null,
    status: loan.status,
    requestedAt: loan._creationTime,
    decidedAt: loan.decidedAt ?? null,
    returnedAt: loan.returnedAt ?? null,
    role: isOwner ? ("lender" as const) : ("borrower" as const),
    otherParty: other,
    automation: await recentAutomation(ctx, loan._id),
  };
}
