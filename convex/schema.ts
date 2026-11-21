import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { categoryValidator, conditionValidator, loanStatusValidator } from "./lib/constants";

export default defineSchema({
  // One row per Clerk identity. `role` is derived server-side (ADMIN_EMAILS), never client-supplied.
  users: defineTable({
    tokenIdentifier: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    trustedLender: v.boolean(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    // Denormalised so the public board can index on it. A tool has at most one active loan.
    status: v.union(v.literal("available"), v.literal("on_loan")),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_status", ["status"])
    .index("by_category", ["category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    toolName: v.string(), // snapshot: history stays readable if the listing is later removed
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(), // YYYY-MM-DD (UTC)
    endDate: v.string(), // YYYY-MM-DD (UTC), inclusive; overdue when today > endDate
    note: v.optional(v.string()),
    status: loanStatusValidator,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_borrowerId", ["borrowerId"])
    .index("by_ownerId", ["ownerId"])
    .index("by_toolId_and_status", ["toolId", "status"])
    .index("by_status_and_endDate", ["status", "endDate"]),

  // What the automations did for a loan (shown in the UI). idempotencyKey makes n8n retries safe.
  automationEvents: defineTable({
    loanId: v.id("loans"),
    kind: v.union(
      v.literal("notification_sent"),
      v.literal("notification_failed"),
      v.literal("reminder_sent"),
      v.literal("reminder_failed"),
    ),
    idempotencyKey: v.string(),
    detail: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_loanId", ["loanId"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  // Failed workflow runs reported by the n8n error workflow (or by Convex delivery giving up).
  automationErrors: defineTable({
    source: v.string(), // workflow name or "convex:webhook-delivery"
    message: v.string(),
    executionId: v.optional(v.string()),
    idempotencyKey: v.string(),
    at: v.number(),
  }).index("by_idempotencyKey", ["idempotencyKey"]),

  // Admin actions, for accountability.
  auditLog: defineTable({
    actorId: v.id("users"),
    action: v.string(),
    target: v.string(),
    detail: v.optional(v.string()),
    at: v.number(),
  }),
});
