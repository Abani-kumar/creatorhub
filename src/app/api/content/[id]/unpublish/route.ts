import { authed } from '@/server/http';
import { unpublishContent } from '@/server/services/content';

export const dynamic = 'force-dynamic';

export const POST = authed<{ id: string }>({ chaos: true }, async ({ store, creatorId, params, now }) =>
  store.write((db) => unpublishContent(db, creatorId, params.id, now)),
);
