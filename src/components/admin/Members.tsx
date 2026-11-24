"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { SealCheck } from "@phosphor-icons/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { errorMessage } from "@/lib/format";
import { Badge, Button, Skeleton } from "../ui";
import { useToast } from "../Toast";
import { TableWrap, td, th } from "./table";

/** Members and the Trusted Lender toggle. */
export function Members() {
  const users = useQuery(api.admin.listUsers);
  const setTrusted = useMutation(api.admin.setTrustedLender);
  const toast = useToast();
  const [busy, setBusy] = useState<Id<"users"> | null>(null);
  if (!users) return <Skeleton className="h-48" />;

  async function toggle(u: NonNullable<typeof users>[number]) {
    setBusy(u._id);
    try {
      await setTrusted({ userId: u._id, trusted: !u.trustedLender });
      toast("success", u.trustedLender ? `Removed Trusted Lender from ${u.name}` : `${u.name} is now a Trusted Lender`);
    } catch (e) {
      toast("error", errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <TableWrap>
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="sr-only">Members</caption>
        <thead className="border-b border-line">
          <tr>
            <th scope="col" className={th}>Member</th>
            <th scope="col" className={th}>Email</th>
            <th scope="col" className={th}>Role</th>
            <th scope="col" className={`${th} text-right`}>Trusted Lender</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {users.map((u) => (
            <tr key={u._id}>
              <td className={`${td} font-medium text-ink`}>
                <span className="inline-flex items-center gap-1">
                  {u.name}
                  {u.trustedLender ? (
                    <>
                      <SealCheck size={15} weight="fill" className="text-accent" />
                      <span className="sr-only">(Trusted Lender)</span>
                    </>
                  ) : null}
                </span>
              </td>
              <td className={`${td} text-muted`}>{u.email}</td>
              <td className={td}>{u.role === "admin" ? <Badge tone="accent">Admin</Badge> : <Badge>Member</Badge>}</td>
              <td className={`${td} text-right`}>
                <Button
                  size="sm"
                  variant={u.trustedLender ? "ghost" : "secondary"}
                  busy={busy === u._id}
                  aria-label={u.trustedLender ? `Revoke Trusted Lender from ${u.name}` : `Mark ${u.name} as a Trusted Lender`}
                  onClick={() => toggle(u)}
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
