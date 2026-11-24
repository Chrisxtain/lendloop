"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LIMITS } from "../../convex/lib/constants";
import { addDays, errorMessage, formatRange, todayUtc } from "@/lib/format";
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
  const bookings = useQuery(api.tools.bookings, { toolId: tool._id });
  const toast = useToast();
  const maxEnd = addDays(start, LIMITS.maxLoanDays - 1);
  // Date ranges only (no names), filtered to ones that still matter.
  const booked = (bookings ?? []).filter((b) => b.endDate >= today);
  const clash = booked.find((b) => start <= b.endDate && b.startDate <= end);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Submit stays enabled; a clash is explained here instead of silently blocking the button.
    if (clash) {
      setError(`Those dates overlap a booking (${formatRange(clash.startDate, clash.endDate)}). Pick dates before or after it.`);
      return;
    }
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
          This is out on loan right now. You can still book it for later dates.
        </p>
      ) : null}
      {booked.length > 0 ? (
        <div className="rounded-lg border border-line px-3 py-2 text-sm">
          <p className="font-medium text-ink">Already booked</p>
          <ul className="mt-1 grid gap-0.5 font-mono text-[13px] text-muted">
            {booked.map((b) => (
              <li key={b.startDate}>{formatRange(b.startDate, b.endDate)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From" htmlFor="req-start">
          <input
            id="req-start"
            name="startDate"
            autoComplete="off"
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
            name="endDate"
            autoComplete="off"
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
          name="note"
          autoComplete="off"
          rows={2}
          maxLength={LIMITS.note.max}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Hanging shelves on Saturday, can pick up Friday evening…"
          className={`${inputClass} h-auto py-2`}
        />
      </Field>
      {clash && !error ? (
        <p role="status" className="text-sm text-warn">
          Those dates overlap a booking ({formatRange(clash.startDate, clash.endDate)}). Pick dates around it.
        </p>
      ) : null}
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
