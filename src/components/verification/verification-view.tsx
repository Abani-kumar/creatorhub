'use client';
import { BadgeCheck, FlaskConical, Hourglass } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiClientError, api } from '@/lib/api-client';
import { countryName } from '@/lib/countries';
import { formatDateTime } from '@/lib/format';
import { refreshAll, useMe, useVerification } from '@/lib/hooks';
import type { DocumentType, VerificationView } from '@/lib/types';
import { Button, LinkButton } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { clearVerificationDraft, VerificationWizard } from './wizard';

const DOC_LABEL: Record<DocumentType, string> = {
  passport: 'Passport', drivers_license: "Driver's licence", national_id: 'National ID card', residence_permit: 'Residence permit',
};

export function VerificationPage() {
  const { data: me } = useMe();
  const { data, error, isLoading, isValidating, mutate } = useVerification();

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[1.65rem] leading-tight font-semibold sm:text-3xl">Verify your identity</h1>
        <p className="mt-1 text-sm text-ink-3">Publishing and scheduling unlock once you&apos;re verified. Drafts never need it.</p>
      </div>

      {error && !data ? (
        <div className="rounded-card bg-surface shadow-card ring-1 ring-line"><ErrorState network={error instanceof ApiClientError && error.isNetwork} message={error.message} onRetry={() => mutate()} retrying={isValidating} /></div>
      ) : isLoading || !data || !me ? (
        <div role="status" aria-label="Loading verification" className="mx-auto max-w-2xl space-y-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-80 w-full rounded-card" /></div>
      ) : data.status === 'verified' ? (
        <VerifiedPanel creatorId={me.creator.id} reviewedAt={data.reviewedAt} />
      ) : data.status === 'pending_review' ? (
        <PendingPanel v={data} demoMode={me.demoMode} />
      ) : (
        <VerificationWizard creatorId={me.creator.id} rejectionReason={data.status === 'rejected' ? data.rejectionReason ?? 'Please check your details and try again.' : null} />
      )}
    </>
  );
}

function VerifiedPanel({ creatorId, reviewedAt }: { creatorId: string; reviewedAt: string | null }) {
  useEffect(() => clearVerificationDraft(creatorId), [creatorId]); // the saved wizard progress is no longer needed
  return (
    <section className="mx-auto max-w-2xl rounded-card bg-surface p-6 text-center shadow-card ring-1 ring-line sm:p-10">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-ok-soft text-ok"><BadgeCheck className="size-7" aria-hidden /></span>
      <h2 className="mt-4 text-xl font-semibold">You&apos;re verified</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-3">
        You can publish and schedule content{reviewedAt ? ` (approved ${formatDateTime(reviewedAt)})` : ''}. Approval never publishes anything by itself: only content you explicitly set to publish automatically goes live.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <LinkButton href="/dashboard#content">Go to my content</LinkButton>
        <LinkButton href="/content/new" variant="secondary">New content</LinkButton>
      </div>
    </section>
  );
}

function PendingPanel({ v, demoMode }: { v: VerificationView; demoMode: boolean }) {
  const s = v.submission;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section aria-live="polite" className="rounded-card bg-surface p-5 shadow-card ring-1 ring-line sm:p-6">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-info-soft text-info"><Hourglass className="size-6" aria-hidden /></span>
          <div>
            <h2 className="text-xl font-semibold">Your verification is in review</h2>
            <p className="mt-1 text-sm text-ink-2">
              {v.submittedAt ? `Submitted ${formatDateTime(v.submittedAt)}. ` : ''}A reviewer is checking your details. You can keep creating drafts while you wait.
            </p>
          </div>
        </div>

        {s && (
          <dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
            <Row label="Name">{s.fullName}</Row>
            <Row label="Country">{countryName(s.country)}</Row>
            <Row label="ID document">{DOC_LABEL[s.documentType]}</Row>
            <Row label="File"><span className="break-all">{s.documentFileName}</span></Row>
          </dl>
        )}

        <p className="mt-5 rounded-lg bg-surface-2 p-3 text-sm text-ink-2 ring-1 ring-line">
          <strong className="font-semibold text-ink">What happens next.</strong> If you approve, nothing is published on your behalf, except content you chose to publish automatically.
          It goes live when your video is ready too. You can cancel that choice on any item.
        </p>
      </section>

      {demoMode ? <ReviewerControls /> : (
        <p className="text-center text-sm text-ink-3">We&apos;ll update this page when the review is finished.</p>
      )}
    </div>
  );
}

/**
 * DEMO ONLY. Rendered only when /api/me reports demo mode, and the endpoint behind it returns 404 otherwise,
 * so hiding/showing this in the browser grants nothing. Real approval would come from a reviewer tool or an
 * identity-provider webhook, never from the creator's own session.
 */
function ReviewerControls() {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  async function decide(decision: 'approve' | 'reject') {
    setBusy(decision);
    try {
      await api.post('/api/demo', { action: 'review', decision, ...(decision === 'reject' && reason.trim() ? { reason: reason.trim() } : {}) });
      await refreshAll();
      toast.success(decision === 'approve' ? 'Approved. Publish choices you made are now being applied.' : 'Rejected with a reason. You can submit again.');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'The demo action failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="reviewer-title" className="rounded-card border border-accent/25 bg-accent-soft/50 p-5">
      <h2 id="reviewer-title" className="flex items-center gap-2 font-sans text-sm font-semibold text-ink"><FlaskConical className="size-4 text-accent" aria-hidden /> Demo: act as the reviewer</h2>
      <p className="mt-1 text-sm text-ink-2">Only available in demo mode. In production a person or an identity provider decides, never the creator.</p>
      <div className="mt-4">
        <label htmlFor="reject-reason" className="mb-1.5 block text-sm font-medium">Rejection reason <span className="font-normal text-ink-3">(optional)</span></label>
        <TextInput id="reject-reason" value={reason} maxLength={300} placeholder="The document photo was too blurry to read." onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => decide('approve')} loading={busy === 'approve'} disabled={busy !== null}>Approve</Button>
        <Button variant="secondary" onClick={() => decide('reject')} loading={busy === 'reject'} disabled={busy !== null}>Reject</Button>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}
