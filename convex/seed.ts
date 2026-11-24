import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Category, Condition } from "./lib/constants";

/**
 * Demo data: `npx convex run seed:demo`. Internal, so it can't be called from a browser.
 * Idempotent: running it twice doesn't duplicate anything. Seeded neighbours can't sign in
 * (their tokenIdentifier is not a real Clerk identity); they just own listings for the demo.
 */
const NEIGHBOURS: { name: string; email: string; trusted: boolean; tools: [string, Category, Condition, string][] }[] = [
  {
    name: "Marisol Okafor",
    email: "marisol.demo@lendloop.test",
    trusted: true,
    tools: [
      ["Hedge trimmer", "garden", "good", "Electric, 50cm blade. Extension lead included."],
      ["Pressure washer", "cleaning", "like_new", "1800W with patio attachment."],
      ["Step ladder (6 step)", "ladders", "good", "Aluminium, folds flat."],
    ],
  },
  {
    name: "Teodor Lindqvist",
    email: "teodor.demo@lendloop.test",
    trusted: false,
    tools: [
      ["4-person tent", "camping", "fair", "Pitches in ten minutes. One pole is taped but solid."],
      ["Camping stove", "camping", "good", "Single burner. Gas canister not included."],
      ["Stand mixer", "kitchen", "like_new", "5L bowl, dough hook and whisk."],
    ],
  },
  {
    name: "Priya Raman",
    email: "priya.demo@lendloop.test",
    trusted: false,
    tools: [
      ["Circular saw", "power_tools", "good", "Comes with a fine and a rough blade. Goggles in the case."],
      ["Socket set (94 pc)", "hand_tools", "good", "Metric and imperial."],
    ],
  },
];

export const demo = internalMutation({
  args: {},
  returns: v.object({ users: v.number(), tools: v.number() }),
  handler: async (ctx) => {
    let users = 0;
    let tools = 0;
    for (const n of NEIGHBOURS) {
      let user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", n.email))
        .unique();
      if (!user) {
        const id = await ctx.db.insert("users", {
          tokenIdentifier: `seed|${n.email}`,
          email: n.email,
          name: n.name,
          role: "user",
          trustedLender: n.trusted,
        });
        user = (await ctx.db.get("users", id))!;
        users++;
      }
      const existing = await ctx.db
        .query("tools")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
        .take(50);
      for (const [name, category, condition, description] of n.tools) {
        if (existing.some((t) => t.name === name)) continue;
        await ctx.db.insert("tools", { ownerId: user._id, name, category, condition, description, status: "available" });
        tools++;
      }
    }
    return { users, tools };
  },
});

/**
 * Demo curation: hands the named listings (and their loans) to a real account, so the
 * demo's maintainer can approve requests reviewers make. Internal only; explicit names
 * only (never "everything"), so real users' listings are never swept up.
 *   npx convex run seed:reassignTools '{"toEmail":"you@example.com","toolNames":["Stand mixer"]}'
 * Skips a tool if the new owner has borrowed it (an owner can't be their own borrower).
 */
export const reassignTools = internalMutation({
  args: { toEmail: v.string(), toolNames: v.array(v.string()) },
  returns: v.object({ moved: v.array(v.string()), skipped: v.array(v.string()) }),
  handler: async (ctx, { toEmail, toolNames }) => {
    const target = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", toEmail.trim().toLowerCase()))
      .unique();
    if (!target) throw new Error(`No user with email ${toEmail}. Sign in once on this deployment first.`);
    const moved: string[] = [];
    const skipped: string[] = [];
    const tools = (await ctx.db.query("tools").take(500)).filter((t) => toolNames.includes(t.name));
    for (const tool of tools) {
      if (tool.ownerId === target._id) {
        skipped.push(`${tool.name} (already theirs)`);
        continue;
      }
      const loans = [];
      for (const status of ["requested", "approved", "declined", "cancelled", "returned"] as const) {
        loans.push(
          ...(await ctx.db
            .query("loans")
            .withIndex("by_toolId_and_status", (q) => q.eq("toolId", tool._id).eq("status", status))
            .take(200)),
        );
      }
      if (loans.some((l) => l.borrowerId === target._id)) {
        skipped.push(`${tool.name} (they borrowed it)`);
        continue;
      }
      await ctx.db.patch("tools", tool._id, { ownerId: target._id });
      for (const loan of loans) await ctx.db.patch("loans", loan._id, { ownerId: target._id });
      moved.push(`${tool.name} (+${loans.length} loan${loans.length === 1 ? "" : "s"})`);
    }
    const missing = toolNames.filter((n) => !tools.some((t) => t.name === n));
    for (const n of missing) skipped.push(`${n} (not found)`);
    return { moved, skipped };
  },
});

/**
 * Demo of the overdue-reminder workflow: `npx convex run seed:demoOverdue`.
 * Teodor borrowed Marisol's hedge trimmer and it was due back 2 days ago.
 * Idempotent: does nothing if that tool already has an active loan. Run seed:demo first.
 */
export const demoOverdue = internalMutation({
  args: {},
  returns: v.union(v.id("loans"), v.null()),
  handler: async (ctx) => {
    const byEmail = (email: string) =>
      ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).unique();
    const owner = await byEmail("marisol.demo@lendloop.test");
    const borrower = await byEmail("teodor.demo@lendloop.test");
    if (!owner || !borrower) throw new Error("Run seed:demo first");
    const tool = (
      await ctx.db.query("tools").withIndex("by_ownerId", (q) => q.eq("ownerId", owner._id)).take(50)
    ).find((t) => t.name === "Hedge trimmer");
    if (!tool || tool.status === "on_loan") return null;
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      toolName: tool.name,
      ownerId: owner._id,
      borrowerId: borrower._id,
      startDate: day(-6),
      endDate: day(-2),
      note: "For the front hedge before the street party.",
      status: "approved",
      decidedAt: Date.now() - 6 * 86_400_000,
    });
    await ctx.db.patch("tools", tool._id, { status: "on_loan" });
    return loanId;
  },
});
