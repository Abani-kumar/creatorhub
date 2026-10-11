'use client';
import { ChartNoAxesColumn } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { useOverview } from '@/lib/hooks';
import { formatDayKey, money, num } from '@/lib/format';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';

const Chart = dynamic(() => import('./performance-chart-inner'), { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> });

type Range = 7 | 30 | 90;
type Metric = 'revenue' | 'purchases';

export function PerformanceChart() {
  const [range, setRange] = useState<Range>(30);
  const [metric, setMetric] = useState<Metric>('revenue');
  const { data, error, isLoading, isValidating, mutate } = useOverview(range);

  const points = useMemo(
    () => data?.series.map((d) => ({ date: d.date, value: metric === 'revenue' ? d.revenueCents / 100 : d.purchases })) ?? [],
    [data, metric],
  );
  const totals = useMemo(() => {
    if (!data) return null;
    const revenue = data.series.reduce((s, d) => s + d.revenueCents, 0);
    const purchases = data.series.reduce((s, d) => s + d.purchases, 0);
    const peak = data.series.reduce((a, b) => ((metric === 'revenue' ? b.revenueCents > a.revenueCents : b.purchases > a.purchases) ? b : a));
    return { revenue, purchases, peak };
  }, [data, metric]);

  const empty = !!totals && totals.purchases === 0;
  const summary = totals
    ? `${metric === 'revenue' ? 'Revenue' : 'Purchases'} over the last ${range} days. Total ${metric === 'revenue' ? money(totals.revenue) : num(totals.purchases)}. Peak day ${formatDayKey(totals.peak.date)}.`
    : 'Loading chart';

  return (
    <section aria-labelledby="perf-title" className="mt-5 rounded-card bg-surface shadow-card ring-1 ring-line">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div>
          <h2 id="perf-title" className="text-base font-semibold">Performance</h2>
          {totals ? (
            <p className="mt-1 text-sm text-ink-3">
              <span className="font-display text-2xl font-semibold text-ink tabular-nums">{metric === 'revenue' ? money(totals.revenue) : num(totals.purchases)}</span>
              <span className="ml-2">{metric === 'revenue' ? 'revenue' : 'purchases'} in the last {range} days</span>
            </p>
          ) : (
            <Skeleton className="mt-2 h-7 w-56" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented<Metric> label="Metric" value={metric} onChange={setMetric} options={[{ value: 'revenue', label: 'Revenue' }, { value: 'purchases', label: 'Purchases' }]} />
          <Segmented<Range> label="Date range" value={range} onChange={setRange} options={[{ value: 7, label: '7D' }, { value: 30, label: '30D' }, { value: 90, label: '90D' }]} />
        </div>
      </div>

      <div className={`h-[230px] px-2 pb-4 transition-opacity sm:h-[290px] sm:px-4 ${isValidating && data ? 'opacity-60' : ''}`}>
        {error && !data ? (
          <ErrorState compact network={(error as { isNetwork?: boolean }).isNetwork} message={error.message} onRetry={() => mutate()} retrying={isValidating} />
        ) : isLoading || !data ? (
          <Skeleton className="size-full rounded-lg" />
        ) : empty ? (
          <EmptyState icon={<ChartNoAxesColumn className="size-5" aria-hidden />} title="No sales in this period yet" body="Once people start buying your videos, revenue and purchases will chart here." />
        ) : (
          <div role="img" aria-label={summary} className="size-full">
            <Chart data={points} metric={metric} />
          </div>
        )}
      </div>
    </section>
  );
}
