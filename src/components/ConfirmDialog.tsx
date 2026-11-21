"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/format";
import { Button, Dialog, Field, inputClass } from "./ui";

/** Confirmation for destructive actions. Optionally collects a reason (admin removal). */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  withReason,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  withReason?: boolean;
  onConfirm: (reason?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim() || undefined);
      setReason("");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="text-sm leading-relaxed text-muted">{body}</p>
      {withReason ? (
        <div className="mt-4">
          <Field label="Reason (shown in the audit log)" htmlFor="confirm-reason">
            <input id="confirm-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          </Field>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Keep it
        </Button>
        <Button variant="danger" busy={busy} onClick={confirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
