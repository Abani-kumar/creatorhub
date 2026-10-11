import { contentInputSchema } from '@/lib/schemas';
import { authed } from '@/server/http';
import { deleteContent, getContentView, updateContent } from '@/server/services/content';

export const dynamic = 'force-dynamic';
type P = { id: string };

export const GET = authed<P>({ chaos: true }, async ({ store, creatorId, params, now }) =>
  store.read((db) => getContentView(db, creatorId, params.id, now)),
);

/** Full update of the editable fields. Goes through the same publication gate as create. */
export const PATCH = authed<P>({ chaos: true }, async ({ store, creatorId, params, now, body }) => {
  const input = await body(contentInputSchema);
  return store.write((db) => updateContent(db, creatorId, params.id, input, now));
});

export const DELETE = authed<P>({ chaos: true }, async ({ store, creatorId, params, now }) =>
  store.write((db) => deleteContent(db, creatorId, params.id, now)),
);
