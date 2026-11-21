import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { recordAutomationError, recordAutomationEvent } from "./lib/automation";
import { daysBetween } from "./lib/validate";

/** Internal functions behind the signed HTTP endpoints in http.ts. Not callable from browsers. */

/**
 * Approved loans whose return date has passed (as of `asOf`, passed in because
 * queries can't read the clock), minus those already reminded today.
 * Minimal fields: borrower name+email to send to, lender name for context.
 */
export const overdueLoans = internalQuery({
  args: { asOf: v.string() },
  handler: async (ctx, { asOf }) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_and_endDate", (q) => q.eq("status", "approved").lt("endDate", asOf))
      .take(200);
    const out = [];
    for (const loan of loans) {
      const reminderKey = `reminder:${loan._id}:${asOf}`; // one reminder per loan per day
      const already = await ctx.db
        .query("automationEvents")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", reminderKey))
        .first();
      if (already) continue;
      const borrower = await ctx.db.get("users", loan.borrowerId);
      const lender = await ctx.db.get("users", loan.ownerId);
      if (!borrower) continue;
      out.push({
        loanId: loan._id,
        reminderKey,
        toolName: loan.toolName,
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, asOf),
        borrower: { name: borrower.name, email: borrower.email },
        lenderName: lender?.name ?? "your neighbour",
      });
    }
    return out;
  },
});

export const recordEvent = internalMutation({
  args: {
    loanId: v.string(),
    kind: v.union(
      v.literal("notification_sent"),
      v.literal("notification_failed"),
      v.literal("reminder_sent"),
      v.literal("reminder_failed"),
    ),
    idempotencyKey: v.string(),
    detail: v.optional(v.string()),
  },
  returns: v.union(v.literal("created"), v.literal("duplicate"), v.literal("unknown_loan")),
  handler: async (ctx, args) => {
    const loanId = ctx.db.normalizeId("loans", args.loanId);
    if (!loanId || !(await ctx.db.get("loans", loanId))) return "unknown_loan";
    return await recordAutomationEvent(ctx, { ...args, loanId });
  },
});

export const recordError = internalMutation({
  args: { source: v.string(), message: v.string(), executionId: v.optional(v.string()), idempotencyKey: v.string() },
  returns: v.union(v.literal("created"), v.literal("duplicate")),
  handler: async (ctx, args) => recordAutomationError(ctx, args),
});
