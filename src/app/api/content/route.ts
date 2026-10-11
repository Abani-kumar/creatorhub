import { contentInputSchema, contentQuerySchema, queryObject } from '@/lib/schemas';
import { authed, json } from '@/server/http';
import { createContent, listContent } from '@/server/services/content';

export const dynamic = 'force-dynamic';

export const GET = authed({ chaos: true }, async ({ store, creatorId, url, now }) => {
  const q = contentQuerySchema.parse(queryObject(url.searchParams));
  return store.read((db) => listContent(db, creatorId, q, now)); // read-only: no write
});

export const POST = authed({ chaos: true }, async ({ store, creatorId, now, body }) => {
  const input = await body(contentInputSchema);
  const created = await store.write((db) => createContent(db, creatorId, input, now));
  return json(created, 201);
});
