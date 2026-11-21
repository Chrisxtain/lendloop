"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Toolbox } from "@phosphor-icons/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { CATEGORIES, CONDITIONS, labelFor } from "../../../../convex/lib/constants";
import { Button, EmptyState, PageHeader, Skeleton, ToolStatusBadge } from "@/components/ui";
import { ToolFormDialog, type ToolDraft } from "@/components/ToolForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";

type Editing = { open: false } | { open: true; toolId?: Id<"tools">; initial?: ToolDraft };

export default function ListingsPage() {
  const tools = useQuery(api.tools.mine);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<Editing>({ open: false });
  const [deleting, setDeleting] = useState<{ _id: Id<"tools">; name: string } | null>(null);
  const toast = useToast();
  const newButton = (
    <Button onClick={() => setEditing({ open: true })}>
      <Plus size={16} weight="bold" /> List a tool
    </Button>
  );

  return (
    <>
      <PageHeader title="My listings" subtitle="Tools you're lending to the neighbourhood." action={tools?.length ? newButton : null} />

      {tools === undefined ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Loading listings">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : tools.length === 0 ? (
        <EmptyState
          icon={<Toolbox size={28} />}
          title="You're not lending anything yet"
          body="List a tool you don't use every week. Neighbours can request it for specific dates and you decide."
          action={newButton}
        />
      ) : (
        <ul className="grid gap-3">
          {tools.map((t) => (
            <li key={t._id} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-ink">{t.name}</p>
                  <ToolStatusBadge status={t.status} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {labelFor(CATEGORIES, t.category)}, {labelFor(CONDITIONS, t.condition).toLowerCase()}
                </p>
                {t.description ? <p className="mt-2 line-clamp-2 text-sm text-body">{t.description}</p> : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setEditing({
                      open: true,
                      toolId: t._id,
                      initial: { name: t.name, category: t.category, condition: t.condition, description: t.description },
                    })
                  }
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={t.status === "on_loan"}
                  title={t.status === "on_loan" ? "Mark it returned before deleting" : undefined}
                  onClick={() => setDeleting({ _id: t._id, name: t.name })}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ToolFormDialog
        open={editing.open}
        onClose={() => setEditing({ open: false })}
        toolId={editing.open ? editing.toolId : undefined}
        initial={editing.open ? editing.initial : undefined}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "listing"}?`}
        body="It disappears from the shelf. Anyone with a pending request is told it's no longer available."
        confirmLabel="Delete listing"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await remove({ toolId: deleting._id });
          toast("success", `${deleting.name} deleted`);
        }}
      />
    </>
  );
}
