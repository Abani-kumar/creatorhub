import { purchasesQuerySchema, queryObject } from '@/lib/schemas';
import { authed } from '@/server/http';
import { listPurchases } from '@/server/services/queries';

export const dynamic = 'force-dynamic';

export const GET = authed({ chaos: true }, async ({ store, creatorId, url }) => {
  const q = purchasesQuerySchema.parse(queryObject(url.searchParams));
  return store.read((db) => listPurchases(db, creatorId, q));
});
