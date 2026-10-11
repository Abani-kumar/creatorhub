'use client';
import { Clapperboard, Clock, Eye, Pencil, Plus, SearchX, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiClientError, api } from '@/lib/api-client';
import { buildQuery, refreshAll, useContentList, useDebounced, useMe, useOverview } from '@/lib/hooks';
import { conversionRate, formatDate, formatDateTime, money, num } from '@/lib/format';
import type { Blocker, ContentStatus, ContentView, VerificationStatus } from '@/lib/types';
import { ContentStatusBadge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SearchInput, SelectInput } from '@/components/ui/field';
import { Pagination } from '@/components/ui/pagination';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { SortHeader } from '@/components/ui/sort-header';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { PublishBlockedDialog, type BlockedInfo } from '@/components/content/publish-blocked-dialog';
import { Thumb } from '@/components/content/thumb';

const PAGE_SIZE = 8;
type SortKey = 'created' | 'title' | 'price' | 'views' | 'purchases' | 'revenue';
type Order = 'asc' | 'desc';

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'created:desc', label: 'Newest first' },
  { value: 'created:asc', label: 'Oldest first' },
  { value: 'revenue:desc', label: 'Revenue: high to low' },
  { value: 'purchases:desc', label: 'Purchases: most' },
  { value: 'views:desc', label: 'Views: most' },
  { value: 'price:desc', label: 'Price: high to low' },
  { value: 'price:asc', label: 'Price: low to high' },
  { value: 'title:asc', label: 'Title: A to Z' },
];

export function ContentSection() {
  const toast = useToast();
  const { data: me } = useMe();
  const overview = useOverview(30).data;

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 200);
  const [status, setStatus] = useState<'all' | ContentStatus>('all');
  const [sort, setSort] = useState<SortKey>('created');
  const [order, setOrder] = useState<Order>('desc');
  const [page, setPage] = useState(1);

  const qs = buildQuery({ q: debouncedQ, status, sort, order, page, pageSize: PAGE_SIZE });
  const { data, error, isLoading, isValidating, mutate } = useContentList(qs);

  useEffect(() => setPage(1), [debouncedQ]);
  useEffect(() => {
    if (data && page > data.totalPages) setPage(data.totalPages); // e.g. deleted the last row of the last page
  }, [data, page]);

  const [deleting, setDeleting] = useState<ContentView | null>(null);
  const [blocked, setBlocked] = useState<{ item: ContentView; info: BlockedInfo } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtersActive = debouncedQ !== '' || status !== 'all';
  const counts = overview?.stats.contentByStatus;

  function toggleSort(key: SortKey) {
    setPage(1);
    if (key === sort) setOrder(order === 'asc' ? 'desc' : 'asc');
    else {
      setSort(key);
      setOrder(key === 'title' ? 'asc' : 'desc');
    }
  }

  async function publish(item: ContentView) {
    setBusyId(item.id);
    try {
      await api.post(`/api/content/${item.id}/publish`);
      toast.success(`“${item.title}” is now published.`);
      await refreshAll();
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'VERIFICATION_REQUIRED') {
        setBlocked({
          item,
          info: {
            verificationStatus: (e.details?.verificationStatus as VerificationStatus) ?? 'unverified',
            deferrable: !!e.details?.deferrable,
            blockers: (e.details?.blockers as Blocker[]) ?? [],
            rejectionReason: me?.creator.verification.rejectionReason,
          },
        });
      } else if (e instanceof ApiClientError && e.code === 'PUBLISH_NOT_READY') {
        toast.error(e.message, { action: { label: 'Edit', href: `/content/${item.id}/edit` } });
      } else {
        toast.error(e instanceof ApiClientError ? e.message : 'Could not publish. Please try again.');
      }
    } finally {
      setBusyId(null);
    }
  }

  async function queuePublish(item: ContentView) {
    await api.post(`/api/content/${item.id}/publish`, { publishWhenReady: true });
    toast.success(`We'll publish “${item.title}” automatically once everything is ready.`);
    await refreshAll();
  }

  async function cancelIntent(item: ContentView) {
    setBusyId(item.id);
    try {
      await api.del(`/api/content/${item.id}/publish-intent`);
      toast.success('Automatic publishing cancelled. It stays a draft.');
      await refreshAll();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Could not cancel. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: ContentView) {
    await api.del(`/api/content/${item.id}`);
    toast.success(`Deleted “${item.title}”.`);
    await refreshAll();
  }

  const actions = { onPublish: publish, onDelete: setDeleting, onCancelIntent: cancelIntent, busyId };
  const items = data?.items ?? [];

  return (
    <section id="content" aria-labelledby="content-title" className="mt-5 scroll-mt-20 rounded-card bg-surface shadow-card ring-1 ring-line">
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="content-title" className="text-base font-semibold">Content</h2>
            <p className="mt-0.5 text-sm text-ink-3">Everything you&apos;ve uploaded and where it stands.</p>
          </div>
          <LinkButton href="/content/new" variant="secondary" size="sm" className="shrink-0">
            <Plus className="size-4" aria-hidden /> New
          </LinkButton>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchInput value={q} onChange={setQ} placeholder="Search by title" label="Search content by title" />
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<'all' | ContentStatus>
              label="Filter by status"
              value={status}
              onChange={(v) => { setStatus(v); setPage(1); }}
              options={[
                { value: 'all', label: 'All', count: overview?.stats.totalContent },
                { value: 'published', label: 'Published', count: counts?.published },
                { value: 'draft', label: 'Draft', count: counts?.draft },
                { value: 'scheduled', label: 'Scheduled', count: counts?.scheduled },
              ]}
            />
            <SelectInput
              label="Sort content"
              className="w-auto xl:hidden"
              value={`${sort}:${order}`}
              onChange={(e) => { const [s, o] = e.target.value.split(':'); setSort(s as SortKey); setOrder(o as Order); setPage(1); }}
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectInput>
          </div>
        </div>
      </div>

      {error && data && (
        <div role="alert" className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad sm:mx-5">
          <span>Couldn&apos;t refresh. Showing the last loaded results.</span>
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => mutate()}>Retry</button>
        </div>
      )}

      <div aria-busy={isLoading && !data}>
        {error && !data ? (
          <ErrorState network={error instanceof ApiClientError && error.isNetwork} message={error.message} onRetry={() => mutate()} retrying={isValidating} />
        ) : isLoading || !data ? (
          <ContentSkeleton />
        ) : items.length === 0 ? (
          filtersActive ? (
            <EmptyState
              icon={<SearchX className="size-5" aria-hidden />}
              title="No content matches"
              body="Try a different search or clear the filters."
              action={<Button variant="secondary" onClick={() => { setQ(''); setStatus('all'); setPage(1); }}>Clear filters</Button>}
            />
          ) : (
            <EmptyState
              icon={<Clapperboard className="size-5" aria-hidden />}
              title="No content yet"
              body="Upload your first video. You can save it as a draft before you verify your identity."
              action={<LinkButton href="/content/new"><Plus className="size-4" aria-hidden /> Upload video</LinkButton>}
            />
          )
        ) : (
          <>
            <ContentTable items={items} sort={sort} order={order} onSort={toggleSort} {...actions} />
            <ContentCards items={items} {...actions} />
          </>
        )}
      </div>

      {data && data.total > 0 && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="Content" />}

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} title={`Delete “${deleting?.title ?? ''}”?`} confirmLabel="Delete" onConfirm={() => remove(deleting!)}>
        <p>This permanently removes the video and its details from your catalogue. This can&apos;t be undone.</p>
        {deleting && deleting.purchases > 0 && (
          <p className="mt-2">
            <strong className="font-semibold text-ink">{num(deleting.purchases)} {deleting.purchases === 1 ? 'person has' : 'people have'} purchased this.</strong> Your earnings history and their receipts are kept.
          </p>
        )}
      </ConfirmDialog>

      <PublishBlockedDialog
        open={!!blocked}
        onClose={() => setBlocked(null)}
        title={blocked?.item.title ?? ''}
        info={blocked?.info ?? null}
        action="publish"
        editHref={blocked ? `/content/${blocked.item.id}/edit` : undefined}
        onQueue={() => queuePublish(blocked!.item)}
      />
    </section>
  );
}

/* ------------------------------ shared bits ------------------------------ */

interface RowProps {
  onPublish: (c: ContentView) => void;
  onDelete: (c: ContentView) => void;
  onCancelIntent: (c: ContentView) => void;
  busyId: string | null;
}

/** Drafts and scheduled items can't have sales yet: show "—" instead of a wall of zeros. */
const hasSales = (c: ContentView) => c.status === 'published' || c.views > 0 || c.purchases > 0 || c.revenueCents > 0;

function subline(c: ContentView): string {
  if (c.status === 'published' && c.publishedAt) return `Published ${formatDate(c.publishedAt)}`;
  if (c.status === 'scheduled' && c.scheduledFor) return `Goes live ${formatDateTime(c.scheduledFor)}`;
  return `Updated ${formatDate(c.updatedAt)}`;
}

const WAIT_LABEL: Partial<Record<Blocker['code'], string>> = {
  VERIFICATION_REQUIRED: 'identity verification',
  VERIFICATION_PENDING: 'verification approval',
  VERIFICATION_REJECTED: 'verification',
  VIDEO_UPLOADING: 'video upload',
  VIDEO_PROCESSING: 'video processing',
};

/** Explains a pending "publish when ready" choice (with a cancel), or why the last automatic publish failed. */
function Notice({ item, onCancelIntent, busy }: { item: ContentView; onCancelIntent: (c: ContentView) => void; busy: boolean }) {
  if (item.publishIntent) {
    const waiting = [...new Set(item.waitingOn.map((b) => WAIT_LABEL[b.code]).filter(Boolean))].join(' and ');
    return (
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-info">
        <span className="inline-flex items-center gap-1.5 font-medium"><Clock className="size-3.5" aria-hidden /> Will {item.publishIntent.kind === 'schedule' ? 'schedule' : 'publish'} automatically</span>
        {waiting && <span className="text-ink-3">· waiting for {waiting}</span>}
        <button type="button" disabled={busy} onClick={() => onCancelIntent(item)} className="rounded px-1 font-medium text-ink-2 underline underline-offset-2 hover:text-ink disabled:opacity-50">Cancel</button>
      </p>
    );
  }
  if (item.lastPublishError) {
    return <p role="status" className="mt-1.5 text-xs text-bad">{item.lastPublishError.message}</p>;
  }
  return null;
}

function Actions({ item, layout, onPublish, onDelete, busyId }: { item: ContentView; layout: 'icons' | 'buttons' } & Pick<RowProps, 'onPublish' | 'onDelete' | 'busyId'>) {
  const canPublish = item.status === 'draft' && !item.publishIntent;
  if (layout === 'icons') {
    return (
      <div className="flex items-center justify-end gap-1">
        {canPublish && <Button size="sm" variant="secondary" loading={busyId === item.id} onClick={() => onPublish(item)} aria-label={`Publish ${item.title}`}>Publish</Button>}
        <LinkButton href={`/content/${item.id}`} variant="ghost" size="icon" aria-label={`View ${item.title}`} title="View"><Eye className="size-4" aria-hidden /></LinkButton>
        <LinkButton href={`/content/${item.id}/edit`} variant="ghost" size="icon" aria-label={`Edit ${item.title}`} title="Edit"><Pencil className="size-4" aria-hidden /></LinkButton>
        <Button variant="danger-ghost" size="icon" aria-label={`Delete ${item.title}`} title="Delete" onClick={() => onDelete(item)}><Trash2 className="size-4" aria-hidden /></Button>
      </div>
    );
  }
  return (
    <div className={`mt-4 grid gap-2 ${canPublish ? 'grid-cols-4' : 'grid-cols-3'}`}>
      {canPublish && <Button size="sm" variant="secondary" loading={busyId === item.id} onClick={() => onPublish(item)} aria-label={`Publish ${item.title}`}>Publish</Button>}
      <LinkButton href={`/content/${item.id}`} variant="secondary" size="sm" aria-label={`View ${item.title}`}><Eye className="size-4" aria-hidden /> View</LinkButton>
      <LinkButton href={`/content/${item.id}/edit`} variant="secondary" size="sm" aria-label={`Edit ${item.title}`}><Pencil className="size-4" aria-hidden /> Edit</LinkButton>
      <Button variant="danger-ghost" size="sm" className="border border-transparent hover:border-bad/20" aria-label={`Delete ${item.title}`} onClick={() => onDelete(item)}><Trash2 className="size-4" aria-hidden /> Delete</Button>
    </div>
  );
}

/* --------------------------------- table --------------------------------- */

function ContentTable({ items, sort, order, onSort, ...row }: { items: ContentView[]; sort: SortKey; order: Order; onSort: (k: SortKey) => void } & RowProps) {
  return (
    <div className="hidden overflow-x-auto xl:block">
      <table className="w-full min-w-[860px] text-sm">
        <caption className="sr-only">Your content, sortable by column</caption>
        <thead className="border-y border-line bg-surface-2/60 text-xs">
          <tr>
            <SortHeader label="Content" active={sort === 'title'} order={order} onClick={() => onSort('title')} />
            <SortHeader label="Price" align="right" active={sort === 'price'} order={order} onClick={() => onSort('price')} />
            <SortHeader label="Views" align="right" active={sort === 'views'} order={order} onClick={() => onSort('views')} />
            <SortHeader label="Purchases" align="right" active={sort === 'purchases'} order={order} onClick={() => onSort('purchases')} />
            <SortHeader label="Revenue" align="right" active={sort === 'revenue'} order={order} onClick={() => onSort('revenue')} />
            <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-3">Status</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium text-ink-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-b border-line last:border-b-0 hover:bg-surface-2/40">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3.5">
                  <Thumb item={c} className="w-28" />
                  <div className="min-w-0 max-w-[22rem]">
                    <p className="line-clamp-2 leading-snug font-medium text-ink">{c.title}</p>
                    <p className="mt-0.5 text-xs text-ink-3">{subline(c)}</p>
                    <Notice item={c} onCancelIntent={row.onCancelIntent} busy={row.busyId === c.id} />
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{c.priceCents == null ? <span className="text-ink-3">—</span> : money(c.priceCents)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{hasSales(c) ? num(c.views) : <span className="text-ink-3">—</span>}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {hasSales(c) ? num(c.purchases) : <span className="text-ink-3">—</span>}
                {c.views > 0 && <span className="block text-xs text-ink-3">{conversionRate(c.purchases, c.views)} conv.</span>}
              </td>
              <td className="px-4 py-3 text-right font-medium tabular-nums">{hasSales(c) ? money(c.revenueCents) : <span className="font-normal text-ink-3">—</span>}</td>
              <td className="px-4 py-3"><ContentStatusBadge status={c.status} /></td>
              <td className="px-3 py-3"><Actions item={c} layout="icons" {...row} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------- cards (phone/tablet) ---------------------------- */

function ContentCards({ items, ...row }: { items: ContentView[] } & RowProps) {
  return (
    <ul className="divide-y divide-line border-t border-line xl:hidden" aria-label="Your content">
      {items.map((c) => (
        <li key={c.id} className="p-4 sm:p-5">
          <div className="flex gap-3.5 sm:gap-4">
            <Thumb item={c} className="w-28 self-start sm:w-44" />
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 font-sans text-[15px] leading-snug font-semibold">{c.title}</h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <ContentStatusBadge status={c.status} />
                <span className="text-xs text-ink-3">{subline(c)}</span>
              </div>
              <Notice item={c} onCancelIntent={row.onCancelIntent} busy={row.busyId === c.id} />
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <Stat label="Price" value={c.priceCents == null ? '—' : money(c.priceCents)} />
                <Stat label="Views" value={hasSales(c) ? num(c.views) : '—'} />
                <Stat label="Purchases" value={hasSales(c) ? num(c.purchases) : '—'} hint={c.views > 0 ? `${conversionRate(c.purchases, c.views)} conv.` : undefined} />
                <Stat label="Revenue" value={hasSales(c) ? money(c.revenueCents) : '—'} strong={hasSales(c)} />
              </dl>
            </div>
          </div>
          <Actions item={c} layout="buttons" {...row} />
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>
        {value}
        {hint && <span className="ml-1.5 text-xs font-normal text-ink-3">{hint}</span>}
      </dd>
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div role="status" aria-label="Loading content" className="divide-y divide-line border-t border-line">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 sm:p-5">
          <Skeleton className="aspect-video w-28 sm:w-44 xl:w-28" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="hidden h-3.5 w-2/3 sm:block" />
          </div>
        </div>
      ))}
    </div>
  );
}
