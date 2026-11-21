import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { fail, requireOwnTool, requireUser } from "./lib/auth";
import { categoryValidator, conditionValidator, LIMITS } from "./lib/constants";
import { cleanText } from "./lib/validate";
import { publicName } from "./lib/views";
import { queueLoanEvent } from "./lib/notify";

const PAGE = 200;

/**
 * PUBLIC (no auth): available tools, name + category ONLY.
 * No owner, no description, no IDs: nothing that identifies a neighbour.
 */
export const listPublic = query({
  args: {},
  returns: v.array(v.object({ name: v.string(), category: categoryValidator })),
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_status", (q) => q.eq("status", "available"))
      .order("desc")
      .take(100);
    return tools.map((t) => ({ name: t.name, category: t.category }));
  },
});

/** Signed-in board: every tool with availability, optionally filtered by category. */
export const list = query({
  args: { category: v.optional(categoryValidator) },
  handler: async (ctx, { category }) => {
    const me = await requireUser(ctx);
    const tools = category
      ? await ctx.db
          .query("tools")
          .withIndex("by_category", (q) => q.eq("category", category))
          .order("desc")
          .take(PAGE)
      : await ctx.db.query("tools").order("desc").take(PAGE);
    return Promise.all(
      tools.map(async (t) => ({
        _id: t._id,
        name: t.name,
        category: t.category,
        condition: t.condition,
        description: t.description,
        status: t.status,
        isMine: t.ownerId === me._id,
        owner: await publicName(ctx, t.ownerId),
      })),
    );
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", me._id))
      .order("desc")
      .take(PAGE);
    return tools.map((t) => ({
      _id: t._id,
      name: t.name,
      category: t.category,
      condition: t.condition,
      description: t.description,
      status: t.status,
    }));
  },
});

const toolFields = {
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
};

function cleanToolInput(args: { name: string; description: string }) {
  return {
    name: cleanText(args.name, "Name", LIMITS.toolName),
    description: cleanText(args.description, "Description", LIMITS.description),
  };
}

export const create = mutation({
  args: toolFields,
  returns: v.id("tools"),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const clean = cleanToolInput(args);
    return await ctx.db.insert("tools", {
      ownerId: me._id, // owner is always the caller; never taken from args
      name: clean.name,
      category: args.category,
      condition: args.condition,
      description: clean.description,
      status: "available",
    });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFields },
  returns: v.null(),
  handler: async (ctx, { toolId, ...args }) => {
    await requireOwnTool(ctx, toolId);
    const clean = cleanToolInput(args);
    await ctx.db.patch("tools", toolId, {
      name: clean.name,
      category: args.category,
      condition: args.condition,
      description: clean.description,
    });
    return null;
  },
});

export const remove = mutation({
  args: { toolId: v.id("tools") },
  returns: v.null(),
  handler: async (ctx, { toolId }) => {
    const { tool } = await requireOwnTool(ctx, toolId);
    if (tool.status === "on_loan") {
      fail("CONFLICT", "This tool is out on loan. Mark it returned before removing it.");
    }
    await closeLoansAndDelete(ctx, tool, { includeActive: false });
    return null;
  },
});

/**
 * Shared by owner delete and admin removal: cancels open requests (and, for admin
 * removal, the active loan), notifies borrowers, then deletes the listing.
 * Loans keep a toolName snapshot so history stays readable.
 */
export async function closeLoansAndDelete(
  ctx: MutationCtx,
  tool: Doc<"tools">,
  opts: { includeActive: boolean },
) {
  const statuses = opts.includeActive ? (["requested", "approved"] as const) : (["requested"] as const);
  for (const status of statuses) {
    const open = await ctx.db
      .query("loans")
      .withIndex("by_toolId_and_status", (q) => q.eq("toolId", tool._id).eq("status", status))
      .take(100);
    for (const loan of open) {
      await ctx.db.patch("loans", loan._id, { status: "cancelled", decidedAt: Date.now() });
      await queueLoanEvent(ctx, loan._id, "tool_removed");
    }
  }
  await ctx.db.delete("tools", tool._id);
}
