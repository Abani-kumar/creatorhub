'use client';
import { Hourglass, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiClientError } from '@/lib/api-client';
import type { Blocker, VerificationStatus } from '@/lib/types';
import { Button, LinkButton } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export interface BlockedInfo {
  verificationStatus: VerificationStatus;
  /** True when waiting could fix every blocker, so "publish automatically when ready" is allowed. */
  deferrable: boolean;
  blockers: Blocker[];
  rejectionReason?: string | null;
}

/**
 * What an unverified creator sees when they try to publish.
 * Instead of a dead-end error: explain why, keep their work safe, and offer an explicit choice:
 *   verify now (+ publish automatically when approved) / publish automatically once verified, verify later /
 *   keep it as a draft. Nothing is published unless the creator chose it.
 */
export function PublishBlockedDialog({
  open, onClose, title, info, action, onQueue, onSaveDraft, editHref,
}: {
  open: boolean;
  onClose: () => void;
  /** Content title, shown so people know exactly what is safe. */
  title: string;
  info: BlockedInfo | null;
  /** "publish" or "schedule", used for wording only. */
  action: 'publish' | 'schedule';
  /** Saves the explicit "publish when ready" intent. `then` says whether the creator chose to verify right away. */
  onQueue: (then: 'verify' | 'stay') => Promise<void>;
  /** Only on the form: keep as a plain draft. */
  onSaveDraft?: () => Promise<void>;
  /** Where to finish missing details (list view only; the form is already on that page). */
  editHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'verify' | 'later' | 'draft' | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!info) return null;

  const status = info.verificationStatus;
  const verb = action === 'schedule' ? 'schedule' : 'publish';
  const others = info.blockers.filter((b) => !b.code.startsWith('VERIFICATION'));

  const copy = {
    unverified: { icon: ShieldAlert, tone: 'bg-warn-soft text-warn', heading: `Verify your identity to ${verb}`, body: `Publishing is available to verified creators. It takes about three minutes. “${title}” is safe as a draft in the meantime.` },
    pending_review: { icon: Hourglass, tone: 'bg-info-soft text-info', heading: 'Your verification is in review', body: `We're still checking your details. You can't ${verb} until it's approved, but “${title}” is safe as a draft.` },
    rejected: { icon: ShieldAlert, tone: 'bg-bad-soft text-bad', heading: "Your verification wasn't approved", body: info.rejectionReason ? `Reason: ${info.rejectionReason}` : 'Please resubmit your details to unlock publishing.' },
    verified: {
      icon: ShieldCheck,
      tone: 'bg-ok-soft text-ok',
      heading: `Can't ${verb} yet`,
      body: info.deferrable
        ? `“${title}” isn't ready yet, but you're verified. We can ${verb} it automatically as soon as it is.`
        : 'Something needs attention before this can go live.',
    },
  }[status];
  const Icon = copy.icon;

  async function queue(then: 'verify' | 'stay', key: 'verify' | 'later') {
    setBusy(key);
    setError(null);
    try {
      await onQueue(then);
      onClose();
      if (then === 'verify') router.push('/verification');
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function draft() {
    if (!onSaveDraft) return;
    setBusy('draft');
    setError(null);
    try {
      await onSaveDraft();
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const canQueue = info.deferrable;
  const needsVerification = status === 'unverified' || status === 'rejected';

  return (
    <Dialog open={open} onClose={() => { setError(null); onClose(); }} title={copy.heading} dismissible={busy === null}>
      <div className="flex gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full ${copy.tone}`}><Icon className="size-5" aria-hidden /></span>
        <p className="text-sm leading-relaxed text-ink-2">{copy.body}</p>
      </div>

      {others.length > 0 && (
        <ul className="mt-4 space-y-1.5 rounded-lg bg-surface-2 p-3 text-sm text-ink-2 ring-1 ring-line">
          {others.map((b) => <li key={b.code}>• {b.message}</li>)}
        </ul>
      )}
      {error && <p role="alert" className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

      <div className="mt-6 flex flex-col gap-2.5">
        {needsVerification && canQueue && (
          <>
            <Button className="h-auto! min-h-11 whitespace-normal! py-2.5 text-center" onClick={() => queue('verify', 'verify')} loading={busy === 'verify'} disabled={busy !== null}>
              {status === 'rejected' ? 'Resubmit now, publish when approved' : 'Verify now, publish when approved'}
            </Button>
            <Button variant="secondary" className="h-auto! min-h-11 whitespace-normal! py-2.5 text-center" onClick={() => queue('stay', 'later')} loading={busy === 'later'} disabled={busy !== null}>
              Verify later, publish when approved
            </Button>
          </>
        )}
        {needsVerification && !canQueue && (
          <LinkButton href="/verification" onClick={onClose}>{status === 'rejected' ? 'Resubmit verification' : 'Verify identity'}</LinkButton>
        )}
        {status === 'verified' && canQueue && (
          <Button onClick={() => queue('stay', 'later')} loading={busy === 'later'} disabled={busy !== null}>
            {action === 'schedule' ? 'Schedule automatically when ready' : 'Publish automatically when ready'}
          </Button>
        )}
        {status === 'pending_review' && (
          <>
            {canQueue && (
              <Button onClick={() => queue('stay', 'later')} loading={busy === 'later'} disabled={busy !== null}>Publish automatically once approved</Button>
            )}
            <LinkButton href="/verification" variant="secondary" onClick={onClose}>Check verification status</LinkButton>
          </>
        )}
        {editHref && others.some((b) => b.code === 'CONTENT_INCOMPLETE' || b.code === 'VIDEO_MISSING') && (
          <LinkButton href={editHref} variant="secondary" onClick={onClose}>Finish the details</LinkButton>
        )}
        {onSaveDraft && (
          <Button variant="secondary" onClick={draft} loading={busy === 'draft'} disabled={busy !== null}>Save as draft</Button>
        )}
        <Button variant="ghost" onClick={onClose} disabled={busy !== null}>{onSaveDraft ? 'Keep editing' : 'Not now'}</Button>
      </div>
      {canQueue && (
        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          Automatic publishing only happens because you chose it, and only once you&apos;re verified and the video is ready. You can cancel it any time from the content list.
        </p>
      )}
    </Dialog>
  );
}
