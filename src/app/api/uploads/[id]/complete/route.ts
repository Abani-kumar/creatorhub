import { authed } from '@/server/http';
import { completeUpload } from '@/server/services/uploads';

export const dynamic = 'force-dynamic';

export const POST = authed<{ id: string }>({ chaos: true }, async ({ store, creatorId, params, now }) =>
  store.write((db) => completeUpload(db, creatorId, params.id, now)),
);
