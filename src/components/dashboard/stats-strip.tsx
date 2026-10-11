'use client';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useOverview } from '@/lib/hooks';
import { money, num } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';

export function StatsStrip() {
  const { data, error, isLoading, mutate, isValidating } = useOverview(30);

  if (error && !data) {
    return (
      <div className="rounded-card bg-surface ring-1 ring-line">
        <ErrorState compact network={(error as { isNetwork?: boolean }).isNetwork} message={error.message} onRetry={() => mutate()} retrying={isValidating} />
      </div>
    );
  }

  const s = data?.stats;
  const delta = s?.revenueDeltaPct;

  return (
    <section aria-label="Overview" className="grid grid-cols-2 gap-px overflow-hidden rounded-card bg-line shadow-card ring-1 ring-line md:grid-cols-4">
      <Stat label="Total revenue" loading={isLoading || !s} value={s && money(s.totalRevenueCents)} sub="All time, after refunds" />
      <Stat
        label="Revenue this month"
        loading={isLoading || !s}
        value={s && money(s.revenueThisMonthCents)}
        sub={
          delta == null ? (
            <span>No sales in the same period last month</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <span className={clsx('inline-flex items-center rounded-full px-1.5 py-0.5 font-medium', delta >= 0 ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad')}>
                {delta >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                {Math.abs(Math.round(delta))}%
              </span>
              vs same days last month
            </span>
          )
        }
      />
      <Stat
        label="Total content"
        loading={isLoading || !s}
        value={s && num(s.totalContent)}
        sub={s && `${s.contentByStatus.published} published · ${s.contentByStatus.draft} draft · ${s.contentByStatus.scheduled} scheduled`}
      />
      <Stat label="Total purchases" loading={isLoading || !s} value={s && num(s.totalPurchases)} sub={s && `${num(s.purchasesThisMonth)} this month`} />
    </section>
  );
}

function Stat({ label, value, sub, loading }: { label: string; value?: string; sub?: React.ReactNode; loading: boolean }) {
  return (
    <div className="bg-surface p-4 sm:p-5">
      <p className="text-sm text-ink-3">{label}</p>
      {loading ? (
        <>
          <Skeleton className="mt-2.5 h-8 w-28" />
          <Skeleton className="mt-3 h-3.5 w-36" />
        </>
      ) : (
        <>
          <p className="mt-1 font-display text-[1.65rem] leading-tight font-semibold tracking-tight tabular-nums sm:text-[1.9rem]">{value}</p>
          <p className="mt-1.5 text-xs leading-snug text-ink-3">{sub}</p>
        </>
      )}
    </div>
  );
}
