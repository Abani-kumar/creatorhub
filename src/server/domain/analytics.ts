import type { Content, ContentStatus, OverviewResponse, Purchase } from '@/lib/types';

const DAY = 86_400_000;

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Per-content stats come ONLY from completed purchases: refunded/failed/pending are not revenue. */
export function purchaseStats(purchases: readonly Purchase[]): Map<string, { purchases: number; revenueCents: number }> {
  const map = new Map<string, { purchases: number; revenueCents: number }>();
  for (const p of purchases) {
    if (p.status !== 'completed') continue;
    const s = map.get(p.contentId) ?? { purchases: 0, revenueCents: 0 };
    s.purchases += 1;
    s.revenueCents += p.amountCents;
    map.set(p.contentId, s);
  }
  return map;
}

export function computeOverview(args: {
  content: readonly Content[];
  purchases: readonly Purchase[];
  now: Date;
  range: number;
}): OverviewResponse {
  const { content, purchases, now, range } = args;
  const nowMs = now.getTime();
  const completed = purchases.filter((p) => p.status === 'completed');

  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const monthStart = Date.UTC(y, m, 1);
  const lastMonthStart = Date.UTC(y, m - 1, 1);
  // Compare month-to-date with the SAME elapsed window last month (a partial month vs a full one is misleading).
  const elapsed = nowMs - monthStart;
  const lastWindowEnd = Math.min(lastMonthStart + elapsed, monthStart);

  let revenueThisMonth = 0;
  let purchasesThisMonth = 0;
  let revenueLastWindow = 0;
  let total = 0;
  for (const p of completed) {
    const t = Date.parse(p.createdAt);
    total += p.amountCents;
    if (t >= monthStart && t <= nowMs) {
      revenueThisMonth += p.amountCents;
      purchasesThisMonth += 1;
    } else if (t >= lastMonthStart && t < lastWindowEnd) {
      revenueLastWindow += p.amountCents;
    }
  }

  const buckets = new Map<string, { revenueCents: number; purchases: number }>();
  for (let i = range - 1; i >= 0; i--) buckets.set(utcDay(nowMs - i * DAY), { revenueCents: 0, purchases: 0 });
  for (const p of completed) {
    const b = buckets.get(utcDay(Date.parse(p.createdAt)));
    if (b) {
      b.revenueCents += p.amountCents;
      b.purchases += 1;
    }
  }

  const contentByStatus: Record<ContentStatus, number> = { draft: 0, scheduled: 0, published: 0 };
  for (const c of content) contentByStatus[c.status] += 1;

  return {
    stats: {
      totalRevenueCents: total,
      revenueThisMonthCents: revenueThisMonth,
      revenueSamePeriodLastMonthCents: revenueLastWindow,
      revenueDeltaPct: revenueLastWindow > 0 ? ((revenueThisMonth - revenueLastWindow) / revenueLastWindow) * 100 : null,
      totalContent: content.length,
      contentByStatus,
      totalPurchases: completed.length,
      purchasesThisMonth,
    },
    range,
    series: [...buckets.entries()].map(([date, v]) => ({ date, ...v })),
  };
}
