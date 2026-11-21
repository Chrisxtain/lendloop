import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { loanEventValidator, type LoanEvent } from "./lib/constants";
import { signedHeaders } from "./lib/signing";
import { recordAutomationError, recordAutomationEvent } from "./lib/automation";

/**
 * Convex -> n8n "request notification" webhook.
 *
 * Reliability: scheduled from the mutation (only runs if it commits), retried with
 * backoff on network errors / 408 / 404 / 429 / 5xx, and after the final attempt
 * the failure is written to automationErrors + the loan's activity, so it is
 * visible in the app rather than failing silently.
 */

export const MAX_ATTEMPTS = 5;
// Delay before attempt N+1 (index = attempt that just failed).
const BACKOFF_MS = [0, 30_000, 120_000, 600_000, 1_800_000];
const TIMEOUT_MS = 10_000;

/** Who gets told about each event. */
function recipientRole(event: LoanEvent): "owner" | "borrower" {
  return event === "requested" || event === "cancelled" ? "owner" : "borrower";
}

/**
 * Data minimisation: exactly what the email needs. The recipient's own email (to
 * send to), the other party's display name only, and the loan basics. No user IDs,
 * no other emails, no descriptions.
 */
export const payloadFor = internalQuery({
  args: { loanId: v.id("loans"), event: loanEventValidator },
  handler: async (ctx, { loanId, event }) => {
    const loan = await ctx.db.get("loans", loanId);
    if (!loan) return null;
    const toOwner = recipientRole(event) === "owner";
    const recipient = await ctx.db.get("users", toOwner ? loan.ownerId : loan.borrowerId);
    const other = await ctx.db.get("users", toOwner ? loan.borrowerId : loan.ownerId);
    if (!recipient) return null;
    return {
      eventId: `${loanId}:${event}`, // stable per loan transition; n8n echoes it back as the idempotency key
      event,
      loanId,
      recipient: { name: recipient.name, email: recipient.email },
      otherPartyName: other?.name ?? "A neighbour",
      toolName: loan.toolName,
      startDate: loan.startDate,
      endDate: loan.endDate,
      note: event === "requested" ? (loan.note ?? null) : null,
    };
  },
});

function isRetryable(status: number) {
  return status === 404 || status === 408 || status === 429 || status >= 500;
}

export const deliver = internalAction({
  args: { loanId: v.id("loans"), event: loanEventValidator, attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, { loanId, event, attempt }) => {
    const eventId = `${loanId}:${event}`;
    const url = process.env.N8N_WEBHOOK_URL;
    const secret = process.env.WEBHOOK_SIGNING_SECRET?.split(",")[0]?.trim();
    if (!url || !secret) {
      await ctx.runMutation(internal.notifications.recordDeliveryFailure, {
        loanId,
        eventId,
        message: "N8N_WEBHOOK_URL or WEBHOOK_SIGNING_SECRET is not configured on the Convex deployment.",
      });
      return null;
    }

    const payload = await ctx.runQuery(internal.notifications.payloadFor, { loanId, event });
    if (!payload) return null; // loan or recipient deleted since: nothing to notify

    const body = JSON.stringify(payload);
    let problem: { retryable: boolean; message: string };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { ...(await signedHeaders(secret, body)), "x-lendloop-event-id": eventId },
        body,
        signal: controller.signal,
      });
      if (res.ok) return null;
      problem = { retryable: isRetryable(res.status), message: `n8n responded with HTTP ${res.status}` };
    } catch (e) {
      problem = { retryable: true, message: `Could not reach n8n: ${e instanceof Error ? e.message : String(e)}` };
    } finally {
      clearTimeout(timer);
    }

    if (problem.retryable && attempt < MAX_ATTEMPTS) {
      console.warn(`[notify] ${eventId} attempt ${attempt} failed (${problem.message}); retrying`);
      await ctx.scheduler.runAfter(BACKOFF_MS[attempt], internal.notifications.deliver, {
        loanId,
        event,
        attempt: attempt + 1,
      });
      return null;
    }
    console.error(`[notify] ${eventId} gave up after attempt ${attempt}: ${problem.message}`);
    await ctx.runMutation(internal.notifications.recordDeliveryFailure, {
      loanId,
      eventId,
      message: `${problem.message} (after ${attempt} attempt${attempt === 1 ? "" : "s"})`,
    });
    return null;
  },
});

export const recordDeliveryFailure = internalMutation({
  args: { loanId: v.id("loans"), eventId: v.string(), message: v.string() },
  returns: v.null(),
  handler: async (ctx, { loanId, eventId, message }) => {
    const key = `delivery:${eventId}`;
    await recordAutomationError(ctx, { source: "convex: request notification webhook", message, idempotencyKey: key });
    if (await ctx.db.get("loans", loanId)) {
      await recordAutomationEvent(ctx, { loanId, kind: "notification_failed", idempotencyKey: key, detail: "not delivered" });
    }
    return null;
  },
});
