import { overviewQuerySchema, queryObject } from '@/lib/schemas';
import { authed } from '@/server/http';
import { getOverview } from '@/server/services/queries';

export const dynamic = 'force-dynamic';

export const GET = authed({ chaos: true }, async ({ store, creatorId, url, now }) => {
  const { range } = overviewQuerySchema.parse(queryObject(url.searchParams));
  return store.read((db) => getOverview(db, creatorId, now, range)); // read-only: no write
});
