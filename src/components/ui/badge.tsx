import clsx from 'clsx';
import type { ContentStatus, PurchaseStatus, VerificationStatus } from '@/lib/types';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

const tones: Record<Tone, { pill: string; dot: string }> = {
  ok: { pill: 'bg-ok-soft text-ok', dot: 'bg-ok' },
  warn: { pill: 'bg-warn-soft text-warn', dot: 'bg-[#d98a00]' },
  bad: { pill: 'bg-bad-soft text-bad', dot: 'bg-bad' },
  info: { pill: 'bg-info-soft text-info', dot: 'bg-info' },
  neutral: { pill: 'bg-surface-2 text-ink-3 ring-1 ring-inset ring-line', dot: 'bg-ink-3' },
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  const t = tones[tone];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap', t.pill, className)}>
      <span className={clsx('size-1.5 rounded-full', t.dot)} aria-hidden />
      {children}
    </span>
  );
}

const CONTENT: Record<ContentStatus, [Tone, string]> = {
  published: ['ok', 'Published'],
  scheduled: ['warn', 'Scheduled'],
  draft: ['neutral', 'Draft'],
};
export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  const [tone, label] = CONTENT[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const PURCHASE: Record<PurchaseStatus, [Tone, string]> = {
  completed: ['ok', 'Completed'],
  pending: ['warn', 'Pending'],
  refunded: ['info', 'Refunded'],
  failed: ['bad', 'Failed'],
};
export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  const [tone, label] = PURCHASE[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const VERIFY: Record<VerificationStatus, [Tone, string]> = {
  verified: ['ok', 'Verified'],
  pending_review: ['warn', 'In review'],
  rejected: ['bad', 'Not approved'],
  unverified: ['neutral', 'Not verified'],
};
export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const [tone, label] = VERIFY[status];
  return <Badge tone={tone}>{label}</Badge>;
}
