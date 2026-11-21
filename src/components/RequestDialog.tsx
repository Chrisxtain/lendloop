"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LIMITS } from "../../convex/lib/constants";
import { addDays, errorMessage, todayUtc } from "@/lib/format";
import { Button, Dialog, Field, inputClass } from "./ui";
import { useToast } from "./Toast";

export type RequestTarget = { _id: Id<"tools">; name: string; ownerName: string; onLoan: boolean };

export function RequestDialog({ tool, onClose }: { tool: RequestTarget | null; onClose: () => void }) {
  return (
    <Dialog open={tool !== null} onClose={onClose} title={tool ? `Borrow ${tool.name}` : ""}>
      {tool ? <RequestForm key={tool._id} tool={tool} onDone={onClose} /> : null}
    </Dialog>
  );
}

function RequestForm({ tool, onDone }: { tool: RequestTarget; onDone: () => void }) {
  const today = todayUtc();
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 2));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useMutation(api.loans.request);
  const toast = useToast();
  const maxEnd = addDays(start, LIMITS.maxLoanDays - 1);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await request({ toolId: tool._id, startDate: start, endDate: end, note: note.trim() || undefined });
      toast("success", `Request sent to ${tool.ownerName}`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {tool.onLoan ? (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          This is out on loan right now. You can still ask for later dates.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From" htmlFor="req-start">
          <input
            id="req-start"
            type="date"
            required
            min={today}
            max={addDays(today, LIMITS.maxDaysAhead)}
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (end < e.target.value) setEnd(e.target.value);
            }}
            className={inputClass}
          />
        </Field>
        <Field label="Return by" htmlFor="req-end" hint={`Up to ${LIMITS.maxLoanDays} days.`}>
          <input
            id="req-end"
            type="date"
            required
            min={start}
            max={maxEnd}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label={`Note to ${tool.ownerName} (optional)`} htmlFor="req-note">
        <textarea
          id="req-note"
          rows={2}
          maxLength={LIMITS.note.max}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Hanging shelves on Saturday, can pick up Friday evening."
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
          Send request
        </Button>
      </div>
    </form>
  );
}
