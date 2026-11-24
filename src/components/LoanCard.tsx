"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { motion, useReducedMotion } from "motion/react";
import { BellRinging, EnvelopeSimple, SealCheck, WarningCircle } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import { dueLabel, errorMessage, formatRange, isOverdue, isUpcoming, relativeTime, startsLabel } from "@/lib/format";
import { Button, LoanStatusBadge } from "./ui";
import { ConfirmDialog } from "./ConfirmDialog";
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
  const upcoming = isUpcoming(loan.status, loan.startDate);
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
          <p className="break-words font-medium text-ink">{loan.toolName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
            {lender ? "Requested by" : "Lent by"} {loan.otherParty.name}
            {loan.otherParty.trustedLender ? (
              <>
                <SealCheck size={15} weight="fill" className="text-accent" />
                <span className="sr-only">(Trusted Lender)</span>
              </>
            ) : null}
          </p>
        </div>
        <LoanStatusBadge status={loan.status} overdue={overdue} upcoming={upcoming} />
      </div>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[13px] text-body">{formatRange(loan.startDate, loan.endDate)}</span>
        {upcoming ? (
          <span className="text-sm font-medium text-ink">{startsLabel(loan.startDate)}</span>
        ) : loan.status === "approved" ? (
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
  // Irreversible actions that email the other person go through a confirmation first.
  const [confirm, setConfirm] = useState<null | { title: string; body: string; label: string; action: () => Promise<null>; ok: string }>(null);

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
  const upcoming = isUpcoming(loan.status, loan.startDate);
  const what = `${loan.toolName}, ${formatRange(loan.startDate, loan.endDate)}.`;
  const who = loan.otherParty.name;

  let buttons: React.ReactNode = null;
  if (upcoming) {
    // An approved booking that hasn't started can be cancelled by either side.
    buttons = (
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto"
        aria-label={`Cancel booking for ${loan.toolName}`}
        onClick={() =>
          setConfirm({ title: "Cancel this booking?", body: `${what} ${who} will get an email that it's cancelled.`, label: "Cancel booking", action: () => cancel(id), ok: "Booking cancelled" })
        }
      >
        Cancel booking
      </Button>
    );
  } else if (loan.role === "lender" && loan.status === "requested") {
    buttons = (
      <div className="ml-auto flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Decline request for ${loan.toolName}`}
          onClick={() =>
            setConfirm({ title: "Decline this request?", body: `${what} ${who} will get an email.`, label: "Decline request", action: () => decline(id), ok: "Request declined" })
          }
        >
          Decline
        </Button>
        <Button
          size="sm"
          busy={busy === "approve"}
          aria-label={`Approve request for ${loan.toolName}`}
          onClick={() => run("approve", () => approve(id), "Approved. They'll get an email.")}
        >
          Approve
        </Button>
      </div>
    );
  } else if (loan.role === "lender" && loan.status === "approved") {
    buttons = (
      <Button
        size="sm"
        className="ml-auto"
        busy={busy === "return"}
        aria-label={`Mark ${loan.toolName} returned`}
        onClick={() => run("return", () => markReturned(id), "Marked as returned")}
      >
        Mark returned
      </Button>
    );
  } else if (loan.role === "borrower" && loan.status === "requested") {
    buttons = (
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto"
        aria-label={`Cancel request for ${loan.toolName}`}
        onClick={() =>
          setConfirm({ title: "Cancel your request?", body: `${what} ${who} will get an email.`, label: "Cancel request", action: () => cancel(id), ok: "Request cancelled" })
        }
      >
        Cancel request
      </Button>
    );
  }

  return (
    <>
      {buttons}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ""}
        body={confirm?.body ?? ""}
        confirmLabel={confirm?.label ?? "Confirm"}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          await confirm.action();
          toast("success", confirm.ok);
        }}
      />
    </>
  );
}
