import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { fail, requireAdmin } from "./lib/auth";
import { LIMITS } from "./lib/constants";
import { cleanText } from "./lib/validate";
import { publicName, recentAutomation } from "./lib/views";
import { closeLoansAndDelete } from "./tools";

/** Admin powers. Every function starts with requireAdmin, and every write is audit-logged. */

export const listLoans = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(200);
    return Promise.all(
      loans.map(async (l) => ({
        _id: l._id,
        toolName: l.toolName,
        startDate: l.startDate,
        endDate: l.endDate,
        status: l.status,
        requestedAt: l._creationTime,
        lender: await publicName(ctx, l.ownerId),
        borrower: await publicName(ctx, l.borrowerId),
        automation: await recentAutomation(ctx, l._id),
      })),
    );
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").order("desc").take(200);
    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email, // admins need this to identify members; never shown to regular users
      role: u.role,
      trustedLender: u.trustedLender,
    }));
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { userId, trusted }) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get("users", userId);
    if (!target) fail("NOT_FOUND", "User not found.");
    await ctx.db.patch("users", userId, { trustedLender: trusted });
    await ctx.db.insert("auditLog", {
      actorId: admin._id,
      action: trusted ? "trusted_lender.grant" : "trusted_lender.revoke",
      target: userId,
      at: Date.now(),
    });
    return null;
  },
});

export const removeTool = mutation({
  args: { toolId: v.id("tools"), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { toolId, reason }) => {
    const admin = await requireAdmin(ctx);
    const tool = await ctx.db.get("tools", toolId);
    if (!tool) fail("NOT_FOUND", "That tool no longer exists.");
    const why = reason ? cleanText(reason, "Reason", LIMITS.note) : undefined;
    // Admin removal also closes a loan that is out right now; borrowers are notified.
    await closeLoansAndDelete(ctx, tool);
    await ctx.db.insert("auditLog", {
      actorId: admin._id,
      action: "tool.remove",
      target: `${toolId} (${tool.name})`,
      detail: why,
      at: Date.now(),
    });
    return null;
  },
});

export const listAuditLog = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("auditLog").order("desc").take(50);
    return Promise.all(
      rows.map(async (r) => ({
        _id: r._id,
        actor: (await publicName(ctx, r.actorId)).name,
        action: r.action,
        target: r.target,
        detail: r.detail ?? null,
        at: r.at,
      })),
    );
  },
});

export const listAutomationErrors = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("automationErrors").order("desc").take(50);
    return Promise.all(
      rows.map(async (r) => {
        const loan = r.loanId ? await ctx.db.get("loans", r.loanId) : null;
        return {
          _id: r._id,
          source: r.source,
          message: r.message,
          executionId: r.executionId ?? null,
          at: r.at,
          toolName: loan?.toolName ?? null,
          event: r.event ?? null,
          // Only failures Convex itself recorded (with loan + event) can be re-sent.
          canRetry: Boolean(r.loanId && r.event && loan && !r.resolvedAt),
          retriedAt: r.retriedAt ?? null,
          resolvedAt: r.resolvedAt ?? null,
        };
      }),
    );
  },
});

/**
 * Re-sends a notification Convex gave up on (e.g. n8n was down for longer than the
 * automatic retries). Starts a fresh delivery with full retries; on success the
 * error is marked resolved automatically. Safe to repeat: n8n and Resend dedupe by event ID.
 */
export const retryNotification = mutation({
  args: { errorId: v.id("automationErrors") },
  returns: v.null(),
  handler: async (ctx, { errorId }) => {
    const admin = await requireAdmin(ctx);
    const row = await ctx.db.get("automationErrors", errorId);
    if (!row) fail("NOT_FOUND", "That error no longer exists.");
    if (!row.loanId || !row.event) fail("INVALID", "This error came from n8n. Re-run it from the n8n executions list.");
    if (row.resolvedAt) fail("CONFLICT", "This error is already resolved.");
    if (!(await ctx.db.get("loans", row.loanId))) fail("NOT_FOUND", "The loan for this notification no longer exists.");
    await ctx.db.patch("automationErrors", errorId, { retriedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.notifications.deliver, { loanId: row.loanId, event: row.event, attempt: 1 });
    await ctx.db.insert("auditLog", {
      actorId: admin._id,
      action: "notification.retry",
      target: `${row.loanId} (${row.event})`,
      at: Date.now(),
    });
    return null;
  },
});

/** For errors handled some other way (e.g. fixed in n8n): hides them from the open list. */
export const resolveError = mutation({
  args: { errorId: v.id("automationErrors") },
  returns: v.null(),
  handler: async (ctx, { errorId }) => {
    const admin = await requireAdmin(ctx);
    const row = await ctx.db.get("automationErrors", errorId);
    if (!row) fail("NOT_FOUND", "That error no longer exists.");
    if (!row.resolvedAt) await ctx.db.patch("automationErrors", errorId, { resolvedAt: Date.now() });
    await ctx.db.insert("auditLog", {
      actorId: admin._id,
      action: "automation_error.resolve",
      target: row.source,
      detail: row.message.slice(0, 200),
      at: Date.now(),
    });
    return null;
  },
});
