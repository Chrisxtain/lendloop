"use client";

import { useQuery } from "convex/react";
import { CheckCircle } from "@phosphor-icons/react";
import { api } from "../../../convex/_generated/api";
import { formatRange, isOverdue, isUpcoming } from "@/lib/format";
import { EmptyState, LoanStatusBadge, Skeleton } from "../ui";
import { AutomationLine } from "../LoanCard";
import { TableWrap, td, th } from "./table";

/** Every loan in the neighbourhood with its latest automation activity. */
export function Loans() {
  const loans = useQuery(api.admin.listLoans);
  if (!loans) return <Skeleton className="h-48" />;
  if (loans.length === 0) {
    return <EmptyState icon={<CheckCircle size={28} />} title="No loans yet" body="Requests and loans across the neighbourhood will appear here." />;
  }
  return (
    <TableWrap>
      <table className="w-full min-w-[48rem] text-sm">
        <caption className="sr-only">All loans</caption>
        <thead className="border-b border-line">
          <tr>
            <th scope="col" className={th}>Tool</th>
            <th scope="col" className={th}>Lender to borrower</th>
            <th scope="col" className={th}>Dates</th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={th}>Last automation</th>
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
                <LoanStatusBadge status={l.status} overdue={isOverdue(l.status, l.endDate)} upcoming={isUpcoming(l.status, l.startDate)} />
              </td>
              <td className={td}>
                {l.automation.length ? <AutomationLine events={l.automation} /> : <span className="text-xs text-muted">None yet</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
