import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, getCurrentUser } from "./lib/auth";
import { adminEmails } from "./lib/env";

/**
 * Called by the client right after sign-in. Creates/updates the user row from the
 * verified JWT claims. The role is recomputed from ADMIN_EMAILS on every sign-in,
 * so removing an email from that env var revokes admin on the next session.
 */
export const store = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail("UNAUTHENTICATED", "Please sign in.");
    const email = identity.email?.trim().toLowerCase();
    if (!email) fail("INVALID", "Your account needs an email address.");
    // Display name is visible to neighbours, so it must never be derived from the email.
    const name = identity.name?.trim() || identity.givenName?.trim() || neighbourHandle(identity.tokenIdentifier);
    const role = adminEmails().has(email) ? ("admin" as const) : ("user" as const);

    const existing = await getCurrentUser(ctx);
    if (existing) {
      if (existing.email !== email || existing.name !== name || existing.role !== role) {
        await ctx.db.patch("users", existing._id, { email, name, role });
      }
      return existing._id;
    }
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      email,
      name,
      role,
      trustedLender: false,
    });
  },
});

/** Stable, non-identifying fallback like "Neighbour K3F9" for accounts without a name. */
function neighbourHandle(tokenIdentifier: string): string {
  let h = 0;
  for (const ch of tokenIdentifier) h = (Math.imul(31, h) + ch.charCodeAt(0)) >>> 0;
  return `Neighbour ${h.toString(36).slice(-4).toUpperCase().padStart(4, "0")}`;
}

/** The signed-in user's own profile (null when signed out or not yet stored). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});
