import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { LoanEvent } from "./constants";

/**
 * Called inside the same mutation that changes a loan. Delivery to n8n is
 * scheduled (not awaited), so it only happens if the mutation commits:
 * a transactional outbox, without a separate outbox table.
 *
 * Wired to the signed n8n webhook in step 4.
 */
export async function queueLoanEvent(
  _ctx: MutationCtx,
  _loanId: Id<"loans">,
  _event: LoanEvent,
): Promise<void> {
  // implemented in step 4
}
