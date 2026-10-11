import { verificationSubmitSchema } from '@/lib/schemas';
import { authed, json } from '@/server/http';
import { getVerification, submitVerification } from '@/server/services/verification';

export const dynamic = 'force-dynamic';

/** The signed-in creator's own verification state (summary only). Read-only. */
export const GET = authed({ chaos: true }, async ({ store, creatorId }) => store.read((db) => getVerification(db, creatorId)));

/** Moves unverified/rejected -> pending_review. This endpoint can never mark anyone verified. */
export const POST = authed({ chaos: true }, async ({ store, creatorId, now, body }) => {
  const input = await body(verificationSubmitSchema);
  return json(await store.write((db) => submitVerification(db, creatorId, input, now)), 201);
});
