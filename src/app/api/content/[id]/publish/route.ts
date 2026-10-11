import { publishRequestSchema } from '@/lib/schemas';
import { authed } from '@/server/http';
import { publishContent } from '@/server/services/content';

export const dynamic = 'force-dynamic';

/** Dedicated status change: publish a stored draft now, or schedule it (body.scheduledFor). */
export const POST = authed<{ id: string }>({ chaos: true }, async ({ store, creatorId, params, now, body, req }) => {
  // Body is optional for "publish now".
  const text = await req.clone().text();
  const input = text ? await body(publishRequestSchema) : {};
  return store.write((db) => publishContent(db, creatorId, params.id, input, now));
});
