import { demoActionSchema } from '@/lib/schemas';
import { json, open, sessionCookie } from '@/server/http';
import { applyDemoAction, demoState } from '@/server/services/demo';

export const dynamic = 'force-dynamic';

// demoOnly: when DEMO_MODE !== "true" every method here is a plain 404.
export const GET = open({ demoOnly: true }, async ({ store, creatorId }) =>
  store.read((db) => demoState(db, creatorId)),
);

export const POST = open({ demoOnly: true }, async ({ req, store, now, creatorId, body }) => {
  const action = await body(demoActionSchema); // unknown actions => 400
  const result = await store.write((db) => applyDemoAction(db, creatorId, action, now));
  const state = await store.read((db) => demoState(db, result.newSessionId ? null : creatorId));
  const headers = result.newSessionId ? { 'set-cookie': sessionCookie(req, result.newSessionId) } : undefined;
  return json({ ...state, jobs: result.jobs ?? null }, 200, headers);
});
