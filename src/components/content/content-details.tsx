'use client';
import { ArrowLeft, CircleCheck, Clock, Film, Pencil, Play, Rocket, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiClientError, api } from '@/lib/api-client';
import { conversionRate, formatBytes, formatDate, formatDateTime, formatDuration, money, num } from '@/lib/format';
import { buildQuery, rememberAndRefresh, refreshAll, useContent, useMe, usePurchases } from '@/lib/hooks';
import { forgetContent } from '@/lib/local-content-cache';
import type { Blocker, BlockerCode, ContentView, VerificationStatus } from '@/lib/types';
import { Badge, ContentStatusBadge, PurchaseStatusBadge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { PublishBlockedDialog, type BlockedInfo } from './publish-blocked-dialog';

const BLOCKER_FIX: Record<BlockerCode, { label: string; to: 'verify' | 'edit' | null; note?: string }> = {
  VERIFICATION_REQUIRED: { label: 'Verify identity', to: 'verify' },
  VERIFICATION_PENDING: { label: 'Check status', to: 'verify' },
  VERIFICATION_REJECTED: { label: 'Resubmit', to: 'verify' },
  CONTENT_INCOMPLETE: { label: 'Add details', to: 'edit' },
  VIDEO_MISSING: { label: 'Upload video', to: 'edit' },
  VIDEO_UPLOADING: { label: 'Finish upload', to: 'edit' },
  VIDEO_PROCESSING: { label: '', to: null, note: 'Clears by itself when processing finishes.' },
  VIDEO_FAILED: { label: 'Upload again', to: 'edit' },
};

export function ContentDetails({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { data: me } = useMe();
  const { data: item, error, isLoading, isValidating, mutate } = useContent(id);

  const showPurchases = !!item && (item.status === 'published' || item.purchases > 0);
  const recent = usePurchases(showPurchases ? buildQuery({ contentId: id, pageSize: 5 }) : null);

  const [busy, setBusy] = useState<'publish' | 'unpublish' | 'intent' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [blocked, setBlocked] = useState<BlockedInfo | null>(null);

  if (error && !item) {
    if (error instanceof ApiClientError && error.status === 404) {
      return (
        <div className="rounded-card bg-surface shadow-card ring-1 ring-line">
          <EmptyState
            icon={<Film className="size-5" aria-hidden />}
            title="Content not found"
            body="It may have been deleted, or the link is wrong. If you just saved on the hosted demo, go back to the dashboard — a new server instance may not have that item yet."
            action={<LinkButton href="/dashboard">Back to dashboard</LinkButton>}
          />
        </div>
      );
    }
    return <div className="rounded-card bg-surface shadow-card ring-1 ring-line"><ErrorState network={error instanceof ApiClientError && error.isNetwork} message={error.message} onRetry={() => mutate()} retrying={isValidating} /></div>;
  }
  if (isLoading || !item) return <DetailsSkeleton />;

  const verification: VerificationStatus = me?.creator.verification.status ?? 'unverified';

  async function publish(queue = false) {
    if (!item) return;
    setBusy('publish');
    try {
      const res = await api.post<ContentView>(`/api/content/${item.id}/publish`, queue ? { publishWhenReady: true } : undefined);
      await rememberAndRefresh(res);
      toast.success(res.status === 'published' ? 'Published.' : res.publishIntent ? "Saved. We'll publish it automatically once it's ready." : 'Saved.');
    } catch (e) {
      if (queue) throw e; // the dialog is already open and shows the message itself
      if (e instanceof ApiClientError && (e.code === 'VERIFICATION_REQUIRED' || e.code === 'PUBLISH_NOT_READY') && Array.isArray(e.details?.blockers)) {
        setBlocked({
          verificationStatus: (e.details?.verificationStatus as VerificationStatus) ?? verification,
          deferrable: !!e.details?.deferrable,
          blockers: e.details?.blockers as Blocker[],
          rejectionReason: me?.creator.verification.rejectionReason,
        });
      } else {
        toast.error(e instanceof ApiClientError ? e.message : 'Could not publish. Please try again.');
      }
    } finally {
      setBusy(null);
    }
  }

  async function unpublish() {
    if (!item) return;
    setBusy('unpublish');
    try {
      const res = await api.post<ContentView>(`/api/content/${item.id}/unpublish`);
      await rememberAndRefresh(res);
      toast.success('Moved back to draft.');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Could not unpublish. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function cancelIntent() {
    if (!item) return;
    setBusy('intent');
    try {
      await api.del(`/api/content/${item.id}/publish-intent`);
      await refreshAll();
      toast.success('Automatic publishing cancelled. It stays a draft.');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Could not cancel. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!item) return;
    await api.del(`/api/content/${item.id}`);
    forgetContent(item.id);
    toast.success(`Deleted “${item.title}”.`);
    router.push('/dashboard'); // leave first: revalidating this page's own key would flash a 404 for the item just removed
    void refreshAll();
  }

  const isDraft = item.status === 'draft';
  const sales = item.status === 'published' || item.purchases > 0 || item.views > 0;

  return (
    <>
      <Link href="/dashboard#content" className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-lg pr-2 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All content
      </Link>

      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <ContentStatusBadge status={item.status} />
            {item.priceCents != null && <span className="text-sm font-medium tabular-nums text-ink-2">{money(item.priceCents)}</span>}
          </div>
          <h1 className="text-[1.65rem] leading-tight font-semibold break-words sm:text-3xl">{item.title}</h1>
          <p className="mt-1 text-sm text-ink-3">
            {item.status === 'published' && item.publishedAt ? `Published ${formatDate(item.publishedAt)}` : item.status === 'scheduled' && item.scheduledFor ? `Goes live ${formatDateTime(item.scheduledFor)}` : `Created ${formatDate(item.createdAt)}`}
            {' · '}Updated {formatDate(item.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft && !item.publishIntent && <Button onClick={() => publish()} loading={busy === 'publish'}><Rocket className="size-4" aria-hidden /> Publish</Button>}
          {item.status !== 'draft' && <Button variant="secondary" onClick={unpublish} loading={busy === 'unpublish'}><Undo2 className="size-4" aria-hidden /> Unpublish</Button>}
          <LinkButton href={`/content/${item.id}/edit`} variant="secondary"><Pencil className="size-4" aria-hidden /> Edit</LinkButton>
          <Button variant="danger-ghost" onClick={() => setDeleting(true)}><Trash2 className="size-4" aria-hidden /> Delete</Button>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <Player item={item} />

          <section aria-labelledby="meta-title" className="rounded-card bg-surface p-4 shadow-card ring-1 ring-line sm:p-5">
            <h2 id="meta-title" className="text-base font-semibold">Details</h2>
            <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{item.description || <span className="text-ink-3">No description yet.</span>}</p>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-4 text-sm sm:grid-cols-3">
              <Meta label="Price">{item.priceCents == null ? <span className="text-ink-3">Not set</span> : money(item.priceCents)}</Meta>
              <Meta label="Created">{formatDate(item.createdAt)}</Meta>
              <Meta label="Last updated">{formatDate(item.updatedAt)}</Meta>
              {item.video && (
                <>
                  <Meta label="File"><span className="break-all">{item.video.fileName}</span></Meta>
                  <Meta label="Size">{formatBytes(item.video.sizeBytes)}</Meta>
                  <Meta label="Length">{item.video.durationSec ? formatDuration(item.video.durationSec) : <span className="text-ink-3">Unknown</span>}</Meta>
                  <Meta label="Video status"><VideoBadge state={item.video.state} /></Meta>
                </>
              )}
            </dl>
          </section>
        </div>

        <div className="space-y-5">
          <section aria-labelledby="perf-title" className="rounded-card bg-surface p-4 shadow-card ring-1 ring-line sm:p-5">
            <h2 id="perf-title" className="text-base font-semibold">Performance</h2>
            {!sales ? (
              <p className="mt-3 text-sm text-ink-3">No sales yet. Numbers appear here once this is published.</p>
            ) : (
              <>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
                  <Stat label="Revenue" value={money(item.revenueCents)} strong />
                  <Stat label="Purchases" value={num(item.purchases)} />
                  <Stat label="Views" value={num(item.views)} />
                  <Stat label="Conversion" value={conversionRate(item.purchases, item.views)} />
                </dl>
                <p className="mt-4 text-xs leading-relaxed text-ink-3">Revenue is the full sale price of completed purchases. Refunded, failed and pending purchases are not counted.</p>
              </>
            )}
            {showPurchases && (recent.data?.items.length ?? 0) > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="font-sans text-sm font-semibold">Recent purchases</h3>
                <ul className="mt-2 divide-y divide-line">
                  {recent.data!.items.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="block tabular-nums text-ink-2">{money(p.amountCents)}</span>
                        <span className="block truncate text-xs text-ink-3">{p.countryName} · {formatDate(p.createdAt)}</span>
                      </span>
                      <PurchaseStatusBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <PublishingCard item={item} busy={busy === 'intent'} onCancelIntent={cancelIntent} />
        </div>
      </div>

      <ConfirmDialog open={deleting} onClose={() => setDeleting(false)} title={`Delete “${item.title}”?`} confirmLabel="Delete" onConfirm={remove}>
        <p>This permanently removes the video and its details from your catalogue. This can&apos;t be undone.</p>
        {item.purchases > 0 && (
          <p className="mt-2"><strong className="font-semibold text-ink">{num(item.purchases)} {item.purchases === 1 ? 'person has' : 'people have'} purchased this.</strong> Your earnings history and their receipts are kept.</p>
        )}
      </ConfirmDialog>

      <PublishBlockedDialog
        open={!!blocked}
        onClose={() => setBlocked(null)}
        title={item.title}
        info={blocked}
        action="publish"
        editHref={`/content/${item.id}/edit`}
        onQueue={() => publish(true)}
      />
    </>
  );
}

/* ------------------------------- sub-components ------------------------------- */

/** There is no video file anywhere in the demo, and this says so instead of pretending to play. */
function Player({ item }: { item: ContentView }) {
  return (
    <section aria-label="Video" className="overflow-hidden rounded-card bg-night shadow-card ring-1 ring-line">
      <div className="relative aspect-video bg-night-2">
        {item.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- inline data URL / generated SVG
          <img src={item.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover opacity-55" />
        )}
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-white">
          <div>
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur"><Play className="size-6 translate-x-0.5" aria-hidden /></span>
            <p className="mt-3 text-sm font-medium">No video file is stored in this demo</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-night-text">Only the file&apos;s name, size and type were recorded. Real playback is described in the architecture document.</p>
          </div>
        </div>
        {item.video?.durationSec ? <span className="absolute right-2.5 bottom-2.5 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">{formatDuration(item.video.durationSec)}</span> : null}
      </div>
    </section>
  );
}

function VideoBadge({ state }: { state: NonNullable<ContentView['video']>['state'] }) {
  return {
    uploading: <Badge tone="bad">Upload unfinished</Badge>,
    processing: <Badge tone="info">Processing</Badge>,
    ready: <Badge tone="ok">Ready</Badge>,
    failed: <Badge tone="bad">Failed</Badge>,
  }[state];
}

function PublishingCard({ item, busy, onCancelIntent }: { item: ContentView; busy: boolean; onCancelIntent: () => void }) {
  const blockers = item.blockers;
  return (
    <section aria-labelledby="pub-title" className="rounded-card bg-surface p-4 shadow-card ring-1 ring-line sm:p-5">
      <h2 id="pub-title" className="text-base font-semibold">Publishing</h2>

      {item.status === 'published' && (
        <p className="mt-3 flex gap-2 text-sm text-ink-2"><CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden /> Live{item.publishedAt ? ` since ${formatDate(item.publishedAt)}` : ''}. Nothing is blocking this.</p>
      )}

      {item.status === 'scheduled' && (
        <p className="mt-3 flex gap-2 text-sm text-ink-2">
          <Clock className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <span>
            Goes live {item.scheduledFor ? formatDateTime(item.scheduledFor) : 'at the scheduled time'}. Verification, the video and the details are checked again at that moment.
          </span>
        </p>
      )}

      {item.publishIntent && (
        <div role="status" className="mt-3 rounded-lg bg-info-soft p-3 text-sm text-ink-2">
          <p><strong className="font-semibold text-ink">Set to {item.publishIntent.kind === 'schedule' ? 'schedule' : 'publish'} automatically.</strong> You chose this; nothing else is published for you.</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={onCancelIntent} loading={busy}>Cancel automatic publishing</Button>
        </div>
      )}

      {item.lastPublishError && !item.publishIntent && (
        <p role="status" className="mt-3 flex gap-2 rounded-lg bg-bad-soft p-3 text-sm text-bad"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {item.lastPublishError.message}</p>
      )}

      {item.status !== 'published' && (
        blockers.length === 0 ? (
          <p className="mt-3 flex gap-2 text-sm text-ink-2"><CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden /> Ready. Nothing is blocking this from going live.</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-ink-3">{item.status === 'scheduled' ? 'This would fail at the scheduled time:' : "What's in the way:"}</p>
            <ul className="mt-2 space-y-2.5">
              {blockers.map((b) => {
                const fix = BLOCKER_FIX[b.code];
                return (
                  <li key={b.code} className="rounded-lg bg-surface-2 p-3 text-sm ring-1 ring-line">
                    <p className="text-ink-2">{b.message}</p>
                    {fix.to && <LinkButton href={fix.to === 'verify' ? '/verification' : `/content/${item.id}/edit`} size="sm" variant="secondary" className="mt-2.5">{fix.label}</LinkButton>}
                    {fix.note && <p className="mt-1 text-xs text-ink-3">{fix.note}</p>}
                  </li>
                );
              })}
            </ul>
          </>
        )
      )}
    </section>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={`mt-0.5 tabular-nums ${strong ? 'font-display text-2xl font-semibold' : 'text-lg font-medium'}`}>{value}</dd>
    </div>
  );
}

function DetailsSkeleton() {
  return (
    <div role="status" aria-label="Loading content" className="space-y-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-2/3" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="aspect-video w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    </div>
  );
}
