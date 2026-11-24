"use client";

import { useQuery } from "convex/react";
import { CheckCircle } from "@phosphor-icons/react";
import { api } from "../../../convex/_generated/api";
import { relativeTime } from "@/lib/format";
import { EmptyState, Skeleton } from "../ui";
import { TableWrap, td, th } from "./table";

const auditLabels: Record<string, string> = {
  "tool.remove": "Removed listing",
  "trusted_lender.grant": "Marked Trusted Lender",
  "trusted_lender.revoke": "Revoked Trusted Lender",
  "notification.retry": "Retried a notification",
  "automation_error.resolve": "Resolved an automation error",
};

/** Every admin action, newest first. */
export function AuditLog() {
  const rows = useQuery(api.admin.listAuditLog);
  const users = useQuery(api.admin.listUsers);
  if (!rows || !users) return <Skeleton className="h-48" />;
  if (rows.length === 0) {
    return <EmptyState icon={<CheckCircle size={28} />} title="No admin actions yet" body="Removals, Trusted Lender changes and retries are recorded here." />;
  }
  // Targets are stored as IDs (or "id (name)"); show a readable name where we can.
  const nameFor = (target: string) => users.find((u) => u._id === target)?.name ?? target.replace(/^\S+ \((.*)\)$/, "$1");
  return (
    <TableWrap>
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="sr-only">Audit log</caption>
        <thead className="border-b border-line">
          <tr>
            <th scope="col" className={th}>When</th>
            <th scope="col" className={th}>Admin</th>
            <th scope="col" className={th}>Action</th>
            <th scope="col" className={th}>Target</th>
            <th scope="col" className={th}>Reason</th>
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
