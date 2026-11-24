"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowClockwise, Check, CheckCircle } from "@phosphor-icons/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { errorMessage, relativeTime } from "@/lib/format";
import { Badge, Button, EmptyState, Skeleton } from "../ui";
import { useToast } from "../Toast";

const eventLabels: Record<string, string> = {
  requested: "new request",
  approved: "approval",
  declined: "decline",
  cancelled: "cancellation",
  booking_cancelled: "booking cancellation",
  returned: "return",
  tool_removed: "listing removal",
};

/**
 * Failed automation runs, newest first. Convex-side delivery failures can be re-sent
 * ("Retry now"); anything can be marked resolved once handled. Open errors come first.
 */
export function AutomationErrors() {
  const rows = useQuery(api.admin.listAutomationErrors);
  const retry = useMutation(api.admin.retryNotification);
  const resolve = useMutation(api.admin.resolveError);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  if (!rows) return <Skeleton className="h-48" />;
  const open = rows.filter((r) => !r.resolvedAt);
  const resolved = rows.filter((r) => r.resolvedAt);

  async function act(key: string, fn: () => Promise<null>, ok: string) {
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

  const list = showResolved ? rows : open;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {open.length === 0 ? "No open errors." : `${open.length} open`}
          {resolved.length ? `, ${resolved.length} resolved` : ""}
        </p>
        {resolved.length ? (
          <Button size="sm" variant="ghost" aria-pressed={showResolved} onClick={() => setShowResolved((s) => !s)}>
            {showResolved ? "Hide resolved" : "Show resolved"}
          </Button>
        ) : null}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={28} />}
          title="No failed runs"
          body="If an n8n workflow or a webhook delivery fails after its retries, it is reported here so nothing fails silently."
        />
      ) : (
        <ul className="grid gap-3">
          {list.map((e) => (
            <ErrorRow
              key={e._id}
              e={e}
              busy={busy}
              onRetry={() => act(`retry:${e._id}`, () => retry({ errorId: e._id as Id<"automationErrors"> }), "Retrying now. It clears itself once delivered.")}
              onResolve={() => act(`resolve:${e._id}`, () => resolve({ errorId: e._id as Id<"automationErrors"> }), "Marked as resolved")}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type Row = NonNullable<ReturnType<typeof useQuery<typeof api.admin.listAutomationErrors>>>[number];

function ErrorRow({ e, busy, onRetry, onResolve }: { e: Row; busy: string | null; onRetry: () => void; onResolve: () => void }) {
  const isResolved = Boolean(e.resolvedAt);
  return (
    <li className={`rounded-xl border bg-surface p-4 ${isResolved ? "border-line" : "border-danger/30"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink">{e.source}</p>
          {e.toolName && e.event ? (
            <p className="text-sm text-muted">
              {e.toolName}: {eventLabels[e.event] ?? e.event} email
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {isResolved ? <Badge tone="neutral">Resolved {relativeTime(e.resolvedAt!)}</Badge> : <Badge tone="danger">Open</Badge>}
          <span className="text-xs text-muted">{relativeTime(e.at)}</span>
        </div>
      </div>
      <p className="mt-2 break-words font-mono text-[13px] text-danger">{e.message}</p>
      {e.executionId ? <p className="mt-1 text-xs text-muted">n8n execution {e.executionId}</p> : null}
      {!isResolved ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {e.canRetry ? (
            <Button size="sm" variant="secondary" busy={busy === `retry:${e._id}`} onClick={onRetry}>
              <ArrowClockwise size={14} /> Retry now
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" busy={busy === `resolve:${e._id}`} onClick={onResolve}>
            <Check size={14} /> Mark resolved
          </Button>
          {e.retriedAt ? <span className="text-xs text-muted">Retried {relativeTime(e.retriedAt)}</span> : null}
        </div>
      ) : null}
    </li>
  );
}
