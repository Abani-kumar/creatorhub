import { clearSessionCookie, json, open } from '@/server/http';
import { destroySession } from '@/server/services/auth';

export const dynamic = 'force-dynamic';

export const POST = open({}, async ({ store, sessionId }) => {
  if (sessionId) await store.write((db) => destroySession(db, sessionId));
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
});
