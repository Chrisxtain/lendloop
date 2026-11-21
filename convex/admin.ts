import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
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
    // Admin removal also closes an active loan; borrowers are notified.
    await closeLoansAndDelete(ctx, tool, { includeActive: true });
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
    return rows.map((r) => ({
      _id: r._id,
      source: r.source,
      message: r.message,
      executionId: r.executionId ?? null,
      at: r.at,
    }));
  },
});
