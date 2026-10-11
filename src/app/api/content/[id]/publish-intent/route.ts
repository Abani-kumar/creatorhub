import { authed } from '@/server/http';
import { cancelPublishIntent } from '@/server/services/content';

export const dynamic = 'force-dynamic';

/** Creator cancels "publish automatically when ready". The draft stays as it is. */
export const DELETE = authed<{ id: string }>({ chaos: true }, async ({ store, creatorId, params, now }) =>
  store.write((db) => cancelPublishIntent(db, creatorId, params.id, now)),
);
