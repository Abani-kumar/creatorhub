import { describe, expect, it } from 'vitest';
import { PROCESSING_MS } from '@/lib/constants';
import { advance, api, bodyFrom, completeBody, demo, findByTitle, signIn, store, uploadVideo, useFreshApp } from './helpers';

useFreshApp();

async function samWithIntent() {
  const sam = await signIn('sam');
  const draft = await findByTitle(sam, 'Pottery');
  const res = await api.publish(sam, draft.id, { publishWhenReady: true });
  return { sam, draft, res };
}

describe('explicit "publish when ready" intent', () => {
  it('records the intent, keeps the content a draft, and reports what it is waiting for', async () => {
    const { res } = await samWithIntent();
    expect(res.status).toBe(200);
    expect(res.json.status).toBe('draft');
    expect(res.json.publishIntent.kind).toBe('publish');
    expect(res.json.waitingOn.map((b: any) => b.code)).toEqual(['VERIFICATION_REQUIRED']);
  });

  it('publishes ONLY the content with an intent when verification is approved', async () => {
    const { sam, draft } = await samWithIntent();
    const other = await findByTitle(sam, 'Weekend Hike'); // complete draft, no intent
    await api.verify(sam);
    expect((await api.me(sam)).json.creator.verification.status).toBe('pending_review');
    // still blocked while pending
    expect((await api.get(sam, draft.id)).json.status).toBe('draft');

    await demo(sam, { action: 'review', decision: 'approve' });
    expect((await api.get(sam, draft.id)).json.status).toBe('published');
    expect((await api.get(sam, other.id)).json.status).toBe('draft'); // approval never publishes everything
  });

  it('does not publish after the creator cancels the intent', async () => {
    const { sam, draft } = await samWithIntent();
    const cancelled = await api.cancelIntent(sam, draft.id);
    expect(cancelled.json.publishIntent).toBeNull();
    await api.verify(sam);
    await demo(sam, { action: 'review', decision: 'approve' });
    expect((await api.get(sam, draft.id)).json.status).toBe('draft');
  });

  it('cancelling twice is harmless (idempotent)', async () => {
    const { sam, draft } = await samWithIntent();
    expect((await api.cancelIntent(sam, draft.id)).status).toBe(200);
    expect((await api.cancelIntent(sam, draft.id)).status).toBe(200);
  });

  it('saving the content as a plain draft also cancels the intent', async () => {
    const { sam, draft } = await samWithIntent();
    const saved = await api.patch(sam, draft.id, bodyFrom(draft, { status: 'draft' }));
    expect(saved.json.publishIntent).toBeNull();
  });

  it('rejection keeps the intent waiting; resubmitting + approval then publishes it', async () => {
    const { sam, draft } = await samWithIntent();
    await api.verify(sam);
    await demo(sam, { action: 'review', decision: 'reject', reason: 'Blurry photo' });
    const waiting = (await api.get(sam, draft.id)).json;
    expect(waiting.status).toBe('draft');
    expect(waiting.waitingOn[0].code).toBe('VERIFICATION_REJECTED');
    expect((await api.me(sam)).json.creator.verification.rejectionReason).toBe('Blurry photo');

    expect((await api.verify(sam)).status).toBe(201); // may resubmit after rejection
    await demo(sam, { action: 'review', decision: 'approve' });
    expect((await api.get(sam, draft.id)).json.status).toBe('published');
  });

  it('a schedule intent becomes SCHEDULED (not published) when approved before its time', async () => {
    const sam = await signIn('sam');
    const draft = await findByTitle(sam, 'Pottery');
    const when = new Date(Date.parse('2026-10-20T10:00:00Z')).toISOString();
    const res = await api.publish(sam, draft.id, { scheduledFor: when, publishWhenReady: true });
    expect(res.json.publishIntent.kind).toBe('schedule');
    await api.verify(sam);
    await demo(sam, { action: 'review', decision: 'approve' });
    const after = (await api.get(sam, draft.id)).json;
    expect(after.status).toBe('scheduled');
    expect(after.scheduledFor).toBe(when);
  });

  it('cannot create an intent when waiting would not help (incomplete content)', async () => {
    const sam = await signIn('sam');
    const empty = await findByTitle(sam, 'My First Tutorial');
    const res = await api.publish(sam, empty.id, { publishWhenReady: true });
    expect(res.status).toBe(403);
    expect(res.json.error.details.deferrable).toBe(false);
  });

  describe('verification approved BEFORE video processing finishes', () => {
    async function setup() {
      const sam = await signIn('sam');
      const video = await uploadVideo(sam); // complete, but processing starts now
      const created = await api.create(sam, completeBody(video));
      expect(created.status).toBe(201);
      const queued = await api.publish(sam, created.json.id as string, { publishWhenReady: true });
      expect(queued.status).toBe(200);
      expect(queued.json.status).toBe('draft');
      expect(queued.json.waitingOn.map((b: any) => b.code).sort()).toEqual(['VERIFICATION_REQUIRED', 'VIDEO_PROCESSING']);
      await api.verify(sam);
      return { sam, id: created.json.id as string };
    }

    it('waits for processing, then publishes once ready', async () => {
      const { sam, id } = await setup();
      advance(1_000); // still processing
      await demo(sam, { action: 'review', decision: 'approve' });
      const waiting = (await api.get(sam, id)).json;
      expect(waiting.status).toBe('draft');
      expect(waiting.waitingOn.map((b: any) => b.code)).toEqual(['VIDEO_PROCESSING']);

      advance(PROCESSING_MS); // processing finishes
      expect((await api.get(sam, id)).json.status).toBe('published'); // computed on read

      // Reads wrote nothing; the explicit job persists the change.
      const storedBefore = store.stats.writes;
      expect(await store.read((db) => db.content.find((c) => c.id === id)!.status)).toBe('draft');
      const job = await demo(sam, { action: 'run-jobs' });
      expect(job.json.jobs.published).toBe(1);
      expect(store.stats.writes).toBe(storedBefore + 1);
      expect(await store.read((db) => db.content.find((c) => c.id === id)!.status)).toBe('published');
    });

    it('drops the intent and explains why when processing FAILS', async () => {
      const sam = await signIn('sam');
      await demo(sam, { action: 'fail-next-processing', enabled: true });
      const video = await uploadVideo(sam);
      const created = await api.create(sam, completeBody(video));
      await api.publish(sam, created.json.id as string, { publishWhenReady: true });
      await api.verify(sam);
      await demo(sam, { action: 'review', decision: 'approve' });
      advance(PROCESSING_MS + 1);
      const after = (await api.get(sam, created.json.id)).json;
      expect(after.status).toBe('draft');
      expect(after.publishIntent).toBeNull();
      expect(after.lastPublishError!.code).toBe('VIDEO_FAILED');
    });
  });
});
