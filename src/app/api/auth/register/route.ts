import { registerSchema } from '@/lib/schemas';
import { json, open, sessionCookie } from '@/server/http';
import { registerCreator } from '@/server/services/auth';
import { toCreatorView } from '@/server/services/shared';

export const dynamic = 'force-dynamic';

/** DEMO auth: name + email, no password, no email proof. New creators are always UNVERIFIED. */
export const POST = open({}, async ({ req, store, now, body }) => {
  const input = await body(registerSchema);
  const { creator, session } = await store.write((db) => registerCreator(db, input, now));
  return json({ creator: toCreatorView(creator) }, 201, { 'set-cookie': sessionCookie(req, session) });
});
