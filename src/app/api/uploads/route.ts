import { uploadInitSchema } from '@/lib/schemas';
import { authed, json } from '@/server/http';
import { initUpload } from '@/server/services/uploads';

export const dynamic = 'force-dynamic';

/** Step 1 of a (simulated) multipart upload. Production would return presigned part URLs. */
export const POST = authed({ chaos: true }, async ({ store, creatorId, now, body }) => {
  const input = await body(uploadInitSchema);
  return json(await store.write((db) => initUpload(db, creatorId, input, now)), 201);
});
