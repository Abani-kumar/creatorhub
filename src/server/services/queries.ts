import type { PurchasesQuery } from '@/lib/schemas';
import { countryName } from '@/lib/countries';
import type { Database, OverviewResponse, Paginated, PurchaseView } from '@/lib/types';
import { computeOverview } from '../domain/analytics';
import { resolveContent } from '../domain/jobs';

export function listPurchases(db: Readonly<Database>, creatorId: string, q: PurchasesQuery): Paginated<PurchaseView> {
  const needle = q.q.toLowerCase();
  let items = db.purchases
    .filter((p) => p.creatorId === creatorId)
    .filter((p) => !q.contentId || p.contentId === q.contentId)
    .filter((p) => (q.status === 'all' || p.status === q.status) && (!needle || p.contentTitle.toLowerCase().includes(needle)));

  const dir = q.order === 'asc' ? 1 : -1;
  items = [...items].sort((a, b) =>
    q.sort === 'amount'
      ? (a.amountCents - b.amountCents) * dir || b.createdAt.localeCompare(a.createdAt)
      : a.createdAt.localeCompare(b.createdAt) * dir,
  );

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / q.pageSize));
  const page = Math.min(q.page, totalPages);
  return {
    items: items.slice((page - 1) * q.pageSize, page * q.pageSize).map((p) => ({
      id: p.id, createdAt: p.createdAt, contentId: p.contentId, contentTitle: p.contentTitle,
      amountCents: p.amountCents, country: p.country, countryName: countryName(p.country), status: p.status,
    })),
    page, pageSize: q.pageSize, total, totalPages,
  };
}

export function getOverview(db: Readonly<Database>, creatorId: string, now: Date, range: number): OverviewResponse {
  const content = db.content.filter((c) => c.creatorId === creatorId).map((c) => resolveContent(db, c, now));
  return computeOverview({
    content,
    purchases: db.purchases.filter((p) => p.creatorId === creatorId),
    now,
    range,
  });
}
