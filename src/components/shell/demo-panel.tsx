'use client';
import { FlaskConical, Play, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { ApiClientError, api } from '@/lib/api-client';
import { refreshAll, resetAll, useMe } from '@/lib/hooks';
import type { DemoAction } from '@/lib/schemas';
import type { VerificationStatus } from '@/lib/types';
import type { DemoState } from '@/server/services/demo';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { Toggle } from '@/components/ui/toggle';

type State = DemoState & { jobs: { published: number; scheduled: number; failed: number } | null };

/**
 * DEMO ONLY. Rendered only when /api/me says demoMode is on; the endpoints behind it 404 otherwise.
 * Lets a reviewer reach every state (loading, error, empty, unverified/pending/rejected, interrupted upload...) in one click.
 */
export function DemoPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const { data, error } = useSWR<State>(open ? '/api/demo' : null);
  const { data: meData } = useMe();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(action: DemoAction, opts: { reset?: boolean; message?: string } = {}) {
    setBusy(action.action);
    try {
      const res = await api.post<State>('/api/demo', action);
      await mutate('/api/demo', res, { revalidate: false });
      await mutate('/api/me');
      await (opts.reset ? resetAll() : refreshAll());
      if (action.action === 'run-jobs' && res.jobs) {
        const { published, scheduled, failed } = res.jobs;
        toast.info(`Jobs ran: ${published} published, ${scheduled} scheduled, ${failed} failed.`);
      } else if (opts.message) {
        toast.success(opts.message);
      }
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Demo action failed.');
    } finally {
      setBusy(null);
    }
  }

  const s = data?.settings;
  const me = data?.accounts.find((a) => a.id === data.currentCreatorId);

  return (
    <Dialog open={open} onClose={onClose} variant="panel" title="Demo controls" description="For reviewers. These controls only exist in demo mode and are not production permissions.">
      {error && <p role="alert" className="rounded-lg bg-bad-soft p-3 text-sm text-bad">Demo mode is not enabled on this server.</p>}
      {!data && !error && <p className="text-sm text-ink-3">Loading…</p>}
      {data && s && (
        <div className="divide-y divide-line">
          <Section title="Account">
            <Segmented
              label="Demo account"
              value={me?.key ?? 'none'}
              onChange={(v) => v !== 'none' && run({ action: 'switch-account', account: v as 'maya' | 'sam' }, { reset: true, message: 'Switched account.' }).then(() => router.push('/dashboard'))}
              options={[
                { value: 'maya', label: 'Maya (verified)' },
                { value: 'sam', label: 'Sam (unverified)' },
                ...(me ? [] : [{ value: 'none', label: 'Registered' }]),
              ]}
            />
            <p className="mt-2 text-xs text-ink-3">Maya has the full seeded dashboard. Sam has drafts only and hits the publish gate.</p>
          </Section>

          <Section title="Verification status">
            <Segmented<VerificationStatus>
              label="Verification status"
              value={meData?.creator.verification.status ?? 'unverified'}
              onChange={(v) => run({ action: 'set-verification', status: v }, { message: 'Verification status updated.' })}
              options={[
                { value: 'unverified', label: 'None' },
                { value: 'pending_review', label: 'In review' },
                { value: 'verified', label: 'Verified' },
                { value: 'rejected', label: 'Rejected' },
              ]}
            />
            <p className="mt-3 text-xs text-ink-3">Simulate the reviewer (only when a submission is in review):</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" loading={busy === 'review'} onClick={() => run({ action: 'review', decision: 'approve' }, { message: 'Approved. Pending publish intents were processed.' })}>Approve</Button>
              <Button size="sm" variant="secondary" loading={busy === 'review'} onClick={() => run({ action: 'review', decision: 'reject' }, { message: 'Rejected with a reason.' })}>Reject</Button>
            </div>
          </Section>

          <Section title="Network">
            <p className="mb-2 text-xs text-ink-3">Simulated latency shows loading states.</p>
            <Segmented<0 | 800 | 2500>
              label="Simulated latency"
              value={s.latencyMs as 0 | 800 | 2500}
              onChange={(ms) => run({ action: 'set-latency', ms })}
              options={[{ value: 0, label: 'Off' }, { value: 800, label: '0.8 s' }, { value: 2500, label: '2.5 s' }]}
            />
            <Toggle label="Force API errors" description="Every data request fails with a 503 so you can see error states and retry." checked={s.forceApiErrors} onChange={(enabled) => run({ action: 'set-api-errors', enabled })} />
          </Section>

          <Section title="Uploads">
            <Toggle label="Interrupt the next upload" description="The next simulated upload drops at about 55% and can be resumed." checked={s.failNextUpload} onChange={(enabled) => run({ action: 'fail-next-upload', enabled })} />
            <Toggle label="Fail processing of the next upload" description="Upload succeeds, then processing fails: publishing is blocked." checked={s.failNextProcessing} onChange={(enabled) => run({ action: 'fail-next-processing', enabled })} />
          </Section>

          <Section title="Data">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" loading={busy === 'run-jobs'} onClick={() => run({ action: 'run-jobs' })}>
                <Play className="size-4" aria-hidden /> Run scheduled jobs
              </Button>
              <Button size="sm" variant="secondary" loading={busy === 'load-empty'} onClick={() => run({ action: 'load-empty' }, { message: 'Cleared this account: empty states are now visible.' })}>
                <Trash2 className="size-4" aria-hidden /> Load empty data
              </Button>
              <Button size="sm" variant="secondary" loading={busy === 'reset'} onClick={() => run({ action: 'reset' }, { reset: true, message: 'Demo reset to seed data.' })}>
                <RotateCcw className="size-4" aria-hidden /> Reset demo
              </Button>
            </div>
            <p className="mt-2 text-xs text-ink-3">
              Scheduler last ran: {s.jobsLastRunAt ? new Date(s.jobsLastRunAt).toLocaleTimeString() : 'never'}. In production a worker does this; reads never write.
            </p>
          </Section>
        </div>
      )}
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-4 first:pt-0">
      <h3 className="mb-2.5 font-sans text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

export function DemoButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-10 items-center gap-2 rounded-full bg-accent-soft px-3.5 text-sm font-medium text-accent ring-1 ring-inset ring-accent/20 hover:bg-[#fbd9e4]">
      <FlaskConical className="size-4" aria-hidden />
      <span>Demo</span>
      <span className="sr-only">controls</span>
    </button>
  );
}
