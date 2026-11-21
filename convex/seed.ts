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
