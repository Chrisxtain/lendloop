import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { LoanEvent } from "./constants";

/**
 * Called inside the same mutation that changes a loan. Delivery to n8n is
 * scheduled (not awaited), so it only happens if the mutation commits:
 * a transactional outbox without a separate outbox table.
 */
export async function queueLoanEvent(ctx: MutationCtx, loanId: Id<"loans">, event: LoanEvent): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.notifications.deliver, { loanId, event, attempt: 1 });
}
