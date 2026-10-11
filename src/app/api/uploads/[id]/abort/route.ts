import { authed } from '@/server/http';
import { abortUpload } from '@/server/services/uploads';

export const dynamic = 'force-dynamic';

export const POST = authed<{ id: string }>({}, async ({ store, creatorId, params, now }) =>
  store.write((db) => abortUpload(db, creatorId, params.id, now)),
);
