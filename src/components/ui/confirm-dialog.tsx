'use client';
import { TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ApiClientError } from '@/lib/api-client';
import { Button } from './button';
import { Dialog } from './dialog';

/** Confirmation before a destructive action. Shows progress, keeps itself open and shows the error if the request fails. */
export function ConfirmDialog({
  open, onClose, title, children, confirmLabel, onConfirm,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; confirmLabel: string; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => { setError(null); onClose(); }} title={title} dismissible={!busy}>
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-bad-soft text-bad"><TriangleAlert className="size-5" aria-hidden /></span>
        <div className="text-sm leading-relaxed text-ink-2">{children}</div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={() => { setError(null); onClose(); }} disabled={busy}>Cancel</Button>
        <Button variant="danger" onClick={confirm} loading={busy}>{error ? 'Try again' : confirmLabel}</Button>
      </div>
    </Dialog>
  );
}
