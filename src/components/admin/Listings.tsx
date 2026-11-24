"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle } from "@phosphor-icons/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CATEGORIES, labelFor } from "../../../convex/lib/constants";
import { Button, EmptyState, Skeleton, ToolStatusBadge } from "../ui";
import { ConfirmDialog } from "../ConfirmDialog";
import { useToast } from "../Toast";
import { TableWrap, td, th } from "./table";

/** Every listing, with admin removal (cancels its requests and bookings, notifies borrowers). */
export function Listings() {
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
          <caption className="sr-only">All listings</caption>
          <thead className="border-b border-line">
            <tr>
              <th scope="col" className={th}>Tool</th>
              <th scope="col" className={th}>Category</th>
              <th scope="col" className={th}>Lender</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={th}>
                <span className="sr-only">Actions</span>
              </th>
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
                  <Button size="sm" variant="danger" aria-label={`Remove ${t.name}`} onClick={() => setRemoving({ _id: t._id, name: t.name })}>
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
        body="Open requests, bookings and any loan that is out right now are cancelled, and the people involved are notified."
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
