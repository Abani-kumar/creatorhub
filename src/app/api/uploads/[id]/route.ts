import { authed } from '@/server/http';
import { getUploadView } from '@/server/services/uploads';

export const dynamic = 'force-dynamic';

/** Poll for processing state (uploading -> processing -> ready/failed), computed from timestamps. */
export const GET = authed<{ id: string }>({}, async ({ store, creatorId, params, now }) =>
  store.read((db) => getUploadView(db, creatorId, params.id, now)),
);
