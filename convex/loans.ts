import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, requireLoanParty, requireUser } from "./lib/auth";
import { LIMITS } from "./lib/constants";
import { cleanText, todayUtc, validateLoanDates } from "./lib/validate";
import { loanView } from "./lib/views";
import { queueLoanEvent } from "./lib/notify";

/**
 * Loan lifecycle (each transition is guarded by role AND current status):
 *
 *   requested --approve(owner)--> approved --markReturned(owner)--> returned
 *       |  \--decline(owner)--> declined
 *       \----cancel(borrower)--> cancelled
 */

export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
    note: v.optional(v.string()),
  },
  returns: v.id("loans"),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get("tools", args.toolId);
    if (!tool) fail("NOT_FOUND", "That tool no longer exists.");
    if (tool.ownerId === me._id) fail("INVALID", "You can't borrow your own tool.");

    validateLoanDates(args.startDate, args.endDate, todayUtc());
    const note = args.note ? cleanText(args.note, "Note", LIMITS.note) : undefined;

    // One open request/loan per borrower per tool: stops duplicate spam.
    for (const status of ["requested", "approved"] as const) {
      const open = await ctx.db
        .query("loans")
        .withIndex("by_toolId_and_status", (q) => q.eq("toolId", tool._id).eq("status", status))
        .take(100);
      if (open.some((l) => l.borrowerId === me._id)) {
        fail("CONFLICT", "You already have an open request for this tool.");
      }
    }

    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      toolName: tool.name,
      ownerId: tool.ownerId,
      borrowerId: me._id,
      startDate: args.startDate,
      endDate: args.endDate,
      note: note || undefined,
      status: "requested",
    });
    await queueLoanEvent(ctx, loanId, "requested");
    return loanId;
  },
});

export const approve = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const { loan } = await requireLoanParty(ctx, loanId, "owner");
    if (loan.status !== "requested") fail("CONFLICT", `This request is already ${loan.status}.`);
    const tool = await ctx.db.get("tools", loan.toolId);
    if (!tool) fail("NOT_FOUND", "That tool no longer exists.");
    if (tool.status !== "available") {
      fail("CONFLICT", "This tool is already out on loan. Mark it returned first.");
    }
    await ctx.db.patch("loans", loanId, { status: "approved", decidedAt: Date.now() });
    await ctx.db.patch("tools", tool._id, { status: "on_loan" });
    await queueLoanEvent(ctx, loanId, "approved");
    return null;
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const { loan } = await requireLoanParty(ctx, loanId, "owner");
    if (loan.status !== "requested") fail("CONFLICT", `This request is already ${loan.status}.`);
    await ctx.db.patch("loans", loanId, { status: "declined", decidedAt: Date.now() });
    await queueLoanEvent(ctx, loanId, "declined");
    return null;
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const { loan } = await requireLoanParty(ctx, loanId, "borrower");
    if (loan.status !== "requested") fail("CONFLICT", "Only pending requests can be cancelled.");
    await ctx.db.patch("loans", loanId, { status: "cancelled", decidedAt: Date.now() });
    await queueLoanEvent(ctx, loanId, "cancelled");
    return null;
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const { loan } = await requireLoanParty(ctx, loanId, "owner");
    if (loan.status !== "approved") fail("CONFLICT", "Only active loans can be marked returned.");
    await ctx.db.patch("loans", loanId, { status: "returned", returnedAt: Date.now() });
    const tool = await ctx.db.get("tools", loan.toolId);
    if (tool) await ctx.db.patch("tools", tool._id, { status: "available" });
    await queueLoanEvent(ctx, loanId, "returned");
    return null;
  },
});

/** Requests I made as a borrower. */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrowerId", (q) => q.eq("borrowerId", me._id))
      .order("desc")
      .take(50);
    return Promise.all(loans.map((l) => loanView(ctx, l, me._id)));
  },
});

/** Requests and loans on tools I lend. */
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", me._id))
      .order("desc")
      .take(50);
    return Promise.all(loans.map((l) => loanView(ctx, l, me._id)));
  },
});
