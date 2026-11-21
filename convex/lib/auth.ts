import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Authorization lives here and ONLY here. Every public query/mutation starts by
 * calling one of these guards. Identity always comes from the verified Clerk JWT
 * (ctx.auth), never from a function argument.
 */

export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT";

export function fail(code: ErrorCode, message: string): never {
  throw new ConvexError({ code, message });
}

// MutationCtx's db is a superset of QueryCtx's, so these guards work in both.
type ReadCtx = Pick<QueryCtx, "auth" | "db">;

export async function getCurrentUser(ctx: ReadCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireUser(ctx: ReadCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) fail("UNAUTHENTICATED", "Please sign in.");
  const user = await getCurrentUser(ctx);
  if (!user) fail("UNAUTHENTICATED", "Your account is still being set up. Refresh and try again.");
  return user;
}

export async function requireAdmin(ctx: ReadCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") fail("FORBIDDEN", "Admins only.");
  return user;
}

/** The caller must own the tool. Admin powers are separate functions in admin.ts. */
export async function requireOwnTool(ctx: ReadCtx, toolId: Id<"tools">) {
  const user = await requireUser(ctx);
  const tool = await ctx.db.get("tools", toolId);
  if (!tool) fail("NOT_FOUND", "That tool no longer exists.");
  if (tool.ownerId !== user._id) fail("FORBIDDEN", "You can only change your own listings.");
  return { user, tool };
}

/** The caller must be the given party (lender = "owner", or "borrower") on the loan. */
export async function requireLoanParty(
  ctx: ReadCtx,
  loanId: Id<"loans">,
  party: "owner" | "borrower",
) {
  const user = await requireUser(ctx);
  const loan = await ctx.db.get("loans", loanId);
  if (!loan) fail("NOT_FOUND", "That request no longer exists.");
  const partyId = party === "owner" ? loan.ownerId : loan.borrowerId;
  if (partyId !== user._id) {
    fail("FORBIDDEN", party === "owner" ? "Only the lender can do that." : "Only the borrower can do that.");
  }
  return { user, loan };
}
