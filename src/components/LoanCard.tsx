"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { motion, useReducedMotion } from "motion/react";
import { BellRinging, EnvelopeSimple, SealCheck, WarningCircle } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import { dueLabel, errorMessage, formatRange, isOverdue, relativeTime } from "@/lib/format";
import { Button, LoanStatusBadge } from "./ui";
import { useToast } from "./Toast";

export type LoanRow = FunctionReturnType<typeof api.loans.incoming>[number];
type Automation = LoanRow["automation"][number];

const automationCopy: Record<Automation["kind"], { label: string; icon: typeof BellRinging; failed?: boolean }> = {
  notification_sent: { label: "Email sent", icon: EnvelopeSimple },
  notification_failed: { label: "Email failed", icon: WarningCircle, failed: true },
  reminder_sent: { label: "Reminder sent", icon: BellRinging },
  reminder_failed: { label: "Reminder failed", icon: WarningCircle, failed: true },
};

/** The bonus requirement: recent automation activity on each loan. */
export function AutomationLine({ events }: { events: Automation[] }) {
  if (events.length === 0) return null;
  const latest = events[0];
  const c = automationCopy[latest.kind];
  const Icon = c.icon;
  return (
    <p className={`flex items-center gap-1.5 text-xs ${c.failed ? "text-danger" : "text-muted"}`}>
      <Icon size={14} />
      {c.label} {relativeTime(latest.at)}
      {latest.detail ? <span className="truncate">({latest.detail})</span> : null}
    </p>
  );
}

export function LoanCard({ loan, index }: { loan: LoanRow; index: number }) {
  const overdue = isOverdue(loan.status, loan.endDate);
  const reduce = useReducedMotion();
  const lender = loan.role === "lender";
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-xl border bg-surface p-5 ${overdue ? "border-danger/40" : "border-line"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{loan.toolName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
            {lender ? "Requested by" : "Lent by"} {loan.otherParty.name}
            {loan.otherParty.trustedLender ? (
              <SealCheck size={15} weight="fill" className="text-accent" aria-label="Trusted Lender" />
            ) : null}
          </p>
        </div>
        <LoanStatusBadge status={loan.status} overdue={overdue} />
      </div>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[13px] text-body">{formatRange(loan.startDate, loan.endDate)}</span>
        {loan.status === "approved" ? (
          <span className={`text-sm font-medium ${overdue ? "text-danger" : "text-ink"}`}>{dueLabel(loan.endDate).text}</span>
        ) : null}
      </p>
      {loan.note ? <p className="mt-2 text-sm text-muted">&ldquo;{loan.note}&rdquo;</p> : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <AutomationLine events={loan.automation} />
        <LoanActions loan={loan} />
      </div>
    </motion.li>
  );
}

function LoanActions({ loan }: { loan: LoanRow }) {
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const cancel = useMutation(api.loans.cancel);
  const markReturned = useMutation(api.loans.markReturned);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<null>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast("success", ok);
    } catch (e) {
      toast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const id = { loanId: loan._id };
  if (loan.role === "lender" && loan.status === "requested") {
    return (
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="secondary" busy={busy === "decline"} onClick={() => run("decline", () => decline(id), "Request declined")}>
          Decline
        </Button>
        <Button size="sm" busy={busy === "approve"} onClick={() => run("approve", () => approve(id), "Approved. They'll get an email.")}>
          Approve
        </Button>
      </div>
    );
  }
  if (loan.role === "lender" && loan.status === "approved") {
    return (
      <Button size="sm" className="ml-auto" busy={busy === "return"} onClick={() => run("return", () => markReturned(id), "Marked as returned")}>
        Mark returned
      </Button>
    );
  }
  if (loan.role === "borrower" && loan.status === "requested") {
    return (
      <Button size="sm" variant="ghost" className="ml-auto" busy={busy === "cancel"} onClick={() => run("cancel", () => cancel(id), "Request cancelled")}>
        Cancel request
      </Button>
    );
  }
  return null;
}
