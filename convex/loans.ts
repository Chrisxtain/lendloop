import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { fail, requireLoanParty, requireUser } from "./lib/auth";
import { LIMITS } from "./lib/constants";
import { cleanText, todayUtc, validateLoanDates } from "./lib/validate";
import { loanView } from "./lib/views";
import { queueLoanEvent } from "./lib/notify";
import { describeRange, findClash, syncToolStatus } from "./lib/bookings";

/**
 * Loan lifecycle (each transition is guarded by role AND current state):
 *
 *   requested --approve(lender)--> approved --markReturned(lender, once started)--> returned
 *       |  \--decline(lender)--> declined        \
 *       \----cancel(borrower)--> cancelled        \--cancel before start (borrower or lender)--> cancelled
 *
 * A tool can hold several approved bookings as long as their dates don't overlap
 * (see lib/bookings.ts). It shows "on loan" only while a booking has started.
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

    // One open request/booking per borrower per tool: stops duplicate spam.
    for (const status of ["requested", "approved"] as const) {
      const open = await ctx.db
        .query("loans")
        .withIndex("by_toolId_and_status", (q) => q.eq("toolId", tool._id).eq("status", status))
        .take(100);
      if (open.some((l) => l.borrowerId === me._id)) {
        fail("CONFLICT", "You already have an open request or booking for this tool.");
      }
    }

    // Don't let people ask for dates that are already taken.
    const clash = await findClash(ctx, tool._id, args);
    if (clash) fail("CONFLICT", `That tool is already booked for ${describeRange(clash)}. Please pick other dates.`);

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
    // Checked inside the same transaction, so two overlapping approvals can't both succeed.
    const clash = await findClash(ctx, tool._id, loan, loanId);
    if (clash) fail("CONFLICT", `Those dates overlap an existing booking (${describeRange(clash)}).`);
    await ctx.db.patch("loans", loanId, { status: "approved", decidedAt: Date.now() });
    await syncToolStatus(ctx, tool._id, todayUtc());
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

/**
 * Borrower: cancel a pending request, or an approved booking that hasn't started.
 * Lender: cancel an approved booking that hasn't started (pending ones are declined instead).
 * The other party is notified.
 */
export const cancel = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await ctx.db.get("loans", loanId);
    if (!loan) fail("NOT_FOUND", "That request no longer exists.");
    const isBorrower = loan.borrowerId === me._id;
    const isLender = loan.ownerId === me._id;
    if (!isBorrower && !isLender) fail("FORBIDDEN", "Only the borrower or the lender can cancel this.");

    const today = todayUtc();
    const upcomingBooking = loan.status === "approved" && loan.startDate > today;
    if (isBorrower && loan.status !== "requested" && !upcomingBooking) {
      fail("CONFLICT", "Only pending requests and bookings that haven't started can be cancelled.");
    }
    if (isLender && !isBorrower && !upcomingBooking) {
      fail("CONFLICT", loan.status === "requested" ? "Decline the request instead." : "Only bookings that haven't started can be cancelled.");
    }

    await ctx.db.patch("loans", loanId, { status: "cancelled", decidedAt: Date.now() });
    await syncToolStatus(ctx, loan.toolId, today);
    await queueLoanEvent(ctx, loanId, isBorrower ? "cancelled" : "booking_cancelled");
    return null;
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const { loan } = await requireLoanParty(ctx, loanId, "owner");
    if (loan.status !== "approved") fail("CONFLICT", "Only active loans can be marked returned.");
    const today = todayUtc();
    if (loan.startDate > today) fail("CONFLICT", "This booking hasn't started yet. Cancel it instead.");
    await ctx.db.patch("loans", loanId, { status: "returned", returnedAt: Date.now() });
    await syncToolStatus(ctx, loan.toolId, today); // stays on loan if the next booking already started
    await queueLoanEvent(ctx, loanId, "returned");
    return null;
  },
});

/** Hourly (crons.ts): flips tools to "on loan" when a booking's start date arrives. Idempotent. */
export const activateStartedBookings = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const today = todayUtc();
    const started = await ctx.db
      .query("loans")
      .withIndex("by_status_and_startDate", (q) => q.eq("status", "approved").lte("startDate", today))
      .take(500);
    const toolIds = [...new Set(started.map((l) => l.toolId))] as Id<"tools">[];
    for (const toolId of toolIds) await syncToolStatus(ctx, toolId, today);
    return toolIds.length;
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
