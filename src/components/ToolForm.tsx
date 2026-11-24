"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CATEGORIES, CONDITIONS, LIMITS, type Category, type Condition } from "../../convex/lib/constants";
import { errorMessage } from "@/lib/format";
import { Button, Dialog, Field, inputClass } from "./ui";
import { useToast } from "./Toast";

export type ToolDraft = { name: string; category: Category; condition: Condition; description: string };
const empty: ToolDraft = { name: "", category: "power_tools", condition: "good", description: "" };

/** Create (no toolId) or edit (toolId + initial) a listing. Server re-validates everything. */
export function ToolFormDialog({
  open,
  onClose,
  toolId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  toolId?: Id<"tools">;
  initial?: ToolDraft;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={toolId ? "Edit listing" : "List a tool"}>
      {/* keyed so the form resets each time it opens */}
      {open ? <ToolForm key={toolId ?? "new"} toolId={toolId} initial={initial ?? empty} onDone={onClose} /> : null}
    </Dialog>
  );
}

function ToolForm({ toolId, initial, onDone }: { toolId?: Id<"tools">; initial: ToolDraft; onDone: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const toast = useToast();
  const set = <K extends keyof ToolDraft>(k: K, v: ToolDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (toolId) await update({ toolId, ...draft });
      else await create(draft);
      toast("success", toolId ? "Listing updated" : `${draft.name.trim()} is on the shelf`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Name" htmlFor="tool-name">
        <input
          id="tool-name"
          name="toolName"
          autoComplete="off"
          required
          minLength={LIMITS.toolName.min}
          maxLength={LIMITS.toolName.max}
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Cordless drill…"
          className={inputClass}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="tool-category">
          <select
            id="tool-category"
            name="category"
            value={draft.category}
            onChange={(e) => set("category", e.target.value as Category)}
            className={inputClass}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Condition" htmlFor="tool-condition">
          <select
            id="tool-condition"
            name="condition"
            value={draft.condition}
            onChange={(e) => set("condition", e.target.value as Condition)}
            className={inputClass}
          >
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="Short description"
        htmlFor="tool-description"
        hint={`${draft.description.length}/${LIMITS.description.max}. Mention anything a borrower should know.`}
      >
        <textarea
          id="tool-description"
          name="description"
          autoComplete="off"
          rows={3}
          maxLength={LIMITS.description.max}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="e.g. Two batteries and a charger. Please return it charged…"
          className={`${inputClass} h-auto py-2`}
        />
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" busy={busy}>
          {toolId ? "Save changes" : "List tool"}
        </Button>
      </div>
    </form>
  );
}
