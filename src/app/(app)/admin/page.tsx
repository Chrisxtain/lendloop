"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { SealCheck, ShieldWarning, CheckCircle } from "@phosphor-icons/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { CATEGORIES, labelFor } from "../../../../convex/lib/constants";
import { errorMessage, formatRange, isOverdue, relativeTime } from "@/lib/format";
import { Badge, Button, EmptyState, LoanStatusBadge, PageHeader, Skeleton, ToolStatusBadge } from "@/components/ui";
import { AutomationLine } from "@/components/LoanCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";

type Tab = "members" | "listings" | "loans" | "automation" | "audit";
const TABS: { id: Tab; label: string }[] = [
  { id: "members", label: "Members" },
  { id: "listings", label: "Listings" },
  { id: "loans", label: "All loans" },
  { id: "automation", label: "Automation errors" },
  { id: "audit", label: "Audit log" },
];

const auditLabels: Record<string, string> = {
  "tool.remove": "Removed listing",
  "trusted_lender.grant": "Marked Trusted Lender",
  "trusted_lender.revoke": "Revoked Trusted Lender",
};

export default function AdminPage() {
  const me = useQuery(api.users.me);
  const [tab, setTab] = useState<Tab>("members");

  // The UI check is cosmetic. Every admin query/mutation re-checks the role in Convex.
  if (me === undefined) return <Skeleton className="h-64" />;
  if (me?.role !== "admin") {
    return <EmptyState icon={<ShieldWarning size={28} />} title="Admins only" body="This area is for neighbourhood admins." />;
  }

  return (
    <>
      <PageHeader title="Admin" subtitle="Keep the shelf healthy. Every action here is recorded in the audit log." />
      <div role="tablist" aria-label="Admin sections" className="no-scrollbar mb-8 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px h-10 shrink-0 border-b-2 px-3 text-sm font-medium transition-colors ${
              tab === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "members" && <Members />}
        {tab === "listings" && <Listings />}
        {tab === "loans" && <Loans />}
        {tab === "automation" && <AutomationErrors />}
        {tab === "audit" && <AuditLog />}
      </div>
    </>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-line bg-surface">{children}</div>;
}
const th = "px-4 py-3 text-left text-xs font-medium text-muted";
const td = "px-4 py-3 align-middle";

function Members() {
  const users = useQuery(api.admin.listUsers);
  const setTrusted = useMutation(api.admin.setTrustedLender);
  const toast = useToast();
  const [busy, setBusy] = useState<Id<"users"> | null>(null);
  if (!users) return <Skeleton className="h-48" />;
  return (
    <TableWrap>
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="border-b border-line">
          <tr>
            <th className={th}>Member</th>
            <th className={th}>Email</th>
            <th className={th}>Role</th>
            <th className={`${th} text-right`}>Trusted Lender</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {users.map((u) => (
            <tr key={u._id}>
              <td className={`${td} font-medium text-ink`}>
                <span className="inline-flex items-center gap-1">
                  {u.name}
                  {u.trustedLender ? <SealCheck size={15} weight="fill" className="text-accent" aria-label="Trusted Lender" /> : null}
                </span>
              </td>
              <td className={`${td} text-muted`}>{u.email}</td>
              <td className={td}>{u.role === "admin" ? <Badge tone="accent">Admin</Badge> : <Badge>Member</Badge>}</td>
              <td className={`${td} text-right`}>
                <Button
                  size="sm"
                  variant={u.trustedLender ? "ghost" : "secondary"}
                  busy={busy === u._id}
                  onClick={async () => {
                    setBusy(u._id);
                    try {
                      await setTrusted({ userId: u._id, trusted: !u.trustedLender });
                      toast("success", u.trustedLender ? `Removed Trusted Lender from ${u.name}` : `${u.name} is now a Trusted Lender`);
                    } catch (e) {
                      toast("error", errorMessage(e));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {u.trustedLender ? "Revoke" : "Mark trusted"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function Listings() {
  const tools = useQuery(api.tools.list, {});
  const removeTool = useMutation(api.admin.removeTool);
  const toast = useToast();
  const [removing, setRemoving] = useState<{ _id: Id<"tools">; name: string } | null>(null);
  if (!tools) return <Skeleton className="h-48" />;
  if (tools.length === 0) return <EmptyState icon={<CheckCircle size={28} />} title="No listings" body="Nothing has been listed yet." />;
  return (
    <>
      <TableWrap>
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={th}>Tool</th>
              <th className={th}>Category</th>
              <th className={th}>Lender</th>
              <th className={th}>Status</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tools.map((t) => (
              <tr key={t._id}>
                <td className={`${td} font-medium text-ink`}>{t.name}</td>
                <td className={`${td} text-muted`}>{labelFor(CATEGORIES, t.category)}</td>
                <td className={`${td} text-muted`}>{t.isMine ? "You" : t.owner.name}</td>
                <td className={td}>
                  <ToolStatusBadge status={t.status} />
                </td>
                <td className={`${td} text-right`}>
                  <Button size="sm" variant="danger" onClick={() => setRemoving({ _id: t._id, name: t.name })}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? "listing"}?`}
        body="Open requests and any active loan are cancelled, and the people involved are notified."
        confirmLabel="Remove listing"
        withReason
        onClose={() => setRemoving(null)}
        onConfirm={async (reason) => {
          if (!removing) return;
          await removeTool({ toolId: removing._id, reason });
          toast("success", `${removing.name} removed`);
        }}
      />
    </>
  );
}

function Loans() {
  const loans = useQuery(api.admin.listLoans);
  if (!loans) return <Skeleton className="h-48" />;
  if (loans.length === 0) return <EmptyState icon={<CheckCircle size={28} />} title="No loans yet" body="Requests and loans across the neighbourhood will appear here." />;
  return (
    <TableWrap>
      <table className="w-full min-w-[48rem] text-sm">
        <thead className="border-b border-line">
          <tr>
            <th className={th}>Tool</th>
            <th className={th}>Lender to borrower</th>
            <th className={th}>Dates</th>
            <th className={th}>Status</th>
            <th className={th}>Last automation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {loans.map((l) => (
            <tr key={l._id}>
              <td className={`${td} font-medium text-ink`}>{l.toolName}</td>
              <td className={`${td} text-muted`}>
                {l.lender.name} to {l.borrower.name}
              </td>
              <td className={`${td} font-mono text-[13px]`}>{formatRange(l.startDate, l.endDate)}</td>
              <td className={td}>
                <LoanStatusBadge status={l.status} overdue={isOverdue(l.status, l.endDate)} />
              </td>
              <td className={td}>{l.automation.length ? <AutomationLine events={l.automation} /> : <span className="text-xs text-muted">None yet</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function AuditLog() {
  const rows = useQuery(api.admin.listAuditLog);
  const users = useQuery(api.admin.listUsers);
  if (!rows || !users) return <Skeleton className="h-48" />;
  if (rows.length === 0)
    return <EmptyState icon={<CheckCircle size={28} />} title="No admin actions yet" body="Removals and Trusted Lender changes are recorded here." />;
  const nameFor = (target: string) => users.find((u) => u._id === target)?.name ?? target.replace(/^\S+ \((.*)\)$/, "$1");
  return (
    <TableWrap>
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="border-b border-line">
          <tr>
            <th className={th}>When</th>
            <th className={th}>Admin</th>
            <th className={th}>Action</th>
            <th className={th}>Target</th>
            <th className={th}>Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r._id}>
              <td className={`${td} whitespace-nowrap text-muted`}>{relativeTime(r.at)}</td>
              <td className={td}>{r.actor}</td>
              <td className={`${td} text-ink`}>{auditLabels[r.action] ?? r.action}</td>
              <td className={`${td} text-muted`}>{nameFor(r.target)}</td>
              <td className={`${td} text-muted`}>{r.detail ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function AutomationErrors() {
  const errors = useQuery(api.admin.listAutomationErrors);
  if (!errors) return <Skeleton className="h-48" />;
  if (errors.length === 0)
    return (
      <EmptyState
        icon={<CheckCircle size={28} />}
        title="No failed runs"
        body="If an n8n workflow or a webhook delivery fails after its retries, it is reported here so nothing fails silently."
      />
    );
  return (
    <ul className="grid gap-3">
      {errors.map((e) => (
        <li key={e._id} className="rounded-xl border border-danger/30 bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-ink">{e.source}</p>
            <span className="text-xs text-muted">{relativeTime(e.at)}</span>
          </div>
          <p className="mt-1 break-words font-mono text-[13px] text-danger">{e.message}</p>
          {e.executionId ? <p className="mt-1 text-xs text-muted">n8n execution {e.executionId}</p> : null}
        </li>
      ))}
    </ul>
  );
}
