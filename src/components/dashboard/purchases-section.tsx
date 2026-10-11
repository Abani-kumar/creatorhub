'use client';
import { Receipt, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiClientError } from '@/lib/api-client';
import { buildQuery, useDebounced, usePurchases } from '@/lib/hooks';
import { formatDateTime, money } from '@/lib/format';
import type { PurchaseStatus, PurchaseView } from '@/lib/types';
import { PurchaseStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchInput, SelectInput } from '@/components/ui/field';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { SortHeader } from '@/components/ui/sort-header';
import { EmptyState, ErrorState } from '@/components/ui/states';

const PAGE_SIZE = 10;
type SortKey = 'date' | 'amount';
type Order = 'asc' | 'desc';

export function PurchasesSection() {
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 200);
  const [status, setStatus] = useState<'all' | PurchaseStatus>('all');
  const [sort, setSort] = useState<SortKey>('date');
  const [order, setOrder] = useState<Order>('desc');
  const [page, setPage] = useState(1);

  const qs = buildQuery({ q: debouncedQ, status, sort, order, page, pageSize: PAGE_SIZE });
  const { data, error, isLoading, isValidating, mutate } = usePurchases(qs);

  useEffect(() => setPage(1), [debouncedQ]);
  useEffect(() => {
    if (data && page > data.totalPages) setPage(data.totalPages);
  }, [data, page]);

  const filtersActive = debouncedQ !== '' || status !== 'all';

  function toggleSort(key: SortKey) {
    setPage(1);
    if (key === sort) setOrder(order === 'asc' ? 'desc' : 'asc');
    else {
      setSort(key);
      setOrder('desc');
    }
  }

  const items = data?.items ?? [];

  return (
    <section id="purchases" aria-labelledby="purchases-title" className="mt-5 scroll-mt-20 rounded-card bg-surface shadow-card ring-1 ring-line">
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div>
          <h2 id="purchases-title" className="text-base font-semibold">Recent purchases</h2>
          <p className="mt-0.5 text-sm text-ink-3">Every sale, including pending, refunded and failed payments.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput value={q} onChange={setQ} placeholder="Search by content" label="Search purchases by content" />
          <div className="flex flex-wrap gap-2">
            <SelectInput label="Filter purchases by status" className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value as 'all' | PurchaseStatus); setPage(1); }}>
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
              <option value="failed">Failed</option>
            </SelectInput>
            <SelectInput
              label="Sort purchases"
              className="w-auto md:hidden"
              value={`${sort}:${order}`}
              onChange={(e) => { const [s, o] = e.target.value.split(':'); setSort(s as SortKey); setOrder(o as Order); setPage(1); }}
            >
              <option value="date:desc">Newest first</option>
              <option value="date:asc">Oldest first</option>
              <option value="amount:desc">Amount: high to low</option>
              <option value="amount:asc">Amount: low to high</option>
            </SelectInput>
          </div>
        </div>
      </div>

      <div aria-busy={isLoading && !data}>
        {error && !data ? (
          <ErrorState network={error instanceof ApiClientError && error.isNetwork} message={error.message} onRetry={() => mutate()} retrying={isValidating} />
        ) : isLoading || !data ? (
          <div role="status" aria-label="Loading purchases" className="divide-y divide-line border-t border-line">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
                <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3.5 w-1/3" /></div>
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          filtersActive ? (
            <EmptyState icon={<SearchX className="size-5" aria-hidden />} title="No purchases match" body="Try a different search or status." action={<Button variant="secondary" onClick={() => { setQ(''); setStatus('all'); }}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={<Receipt className="size-5" aria-hidden />} title="No purchases yet" body="When someone buys one of your videos, the sale shows up here." />
          )
        ) : (
          <>
            <PurchasesTable items={items} sort={sort} order={order} onSort={toggleSort} />
            <PurchasesList items={items} />
          </>
        )}
      </div>

      {data && data.total > 0 && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="Purchases" />}
    </section>
  );
}

function PurchasesTable({ items, sort, order, onSort }: { items: PurchaseView[]; sort: SortKey; order: Order; onSort: (k: SortKey) => void }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Recent purchases</caption>
        <thead className="border-y border-line bg-surface-2/60 text-xs">
          <tr>
            <SortHeader label="Date" active={sort === 'date'} order={order} onClick={() => onSort('date')} />
            <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-3">Content</th>
            <SortHeader label="Amount" align="right" active={sort === 'amount'} order={order} onClick={() => onSort('amount')} />
            <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-3">Country</th>
            <th scope="col" className="px-4 py-2.5 text-left font-medium text-ink-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-b border-line last:border-b-0 hover:bg-surface-2/40">
              <td className="px-4 py-3 whitespace-nowrap text-ink-2 tabular-nums">{formatDateTime(p.createdAt)}</td>
              <td className="max-w-[20rem] px-4 py-3"><span className="line-clamp-1 font-medium" title={p.contentTitle}>{p.contentTitle}</span></td>
              <td className={`px-4 py-3 text-right font-medium tabular-nums ${p.status === 'failed' || p.status === 'refunded' ? 'text-ink-3 line-through decoration-ink-3/50' : ''}`}>{money(p.amountCents)}</td>
              <td className="px-4 py-3 text-ink-2">{p.countryName}</td>
              <td className="px-4 py-3"><PurchaseStatusBadge status={p.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PurchasesList({ items }: { items: PurchaseView[] }) {
  return (
    <ul className="divide-y divide-line border-t border-line md:hidden" aria-label="Recent purchases">
      {items.map((p) => (
        <li key={p.id} className="px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <p className="line-clamp-2 text-[15px] leading-snug font-medium">{p.contentTitle}</p>
            <p className={`shrink-0 font-semibold tabular-nums ${p.status === 'failed' || p.status === 'refunded' ? 'text-ink-3 line-through' : ''}`}>{money(p.amountCents)}</p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-3">
            <PurchaseStatusBadge status={p.status} />
            <span className="tabular-nums">{formatDateTime(p.createdAt)}</span>
            <span>{p.countryName}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
