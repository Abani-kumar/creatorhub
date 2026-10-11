import { describe, expect, it } from 'vitest';
import { advance, api, bodyFrom, completeBody, demo, findByTitle, register, signIn, uploadVideo, useFreshApp } from './helpers';

useFreshApp();

describe('cross-creator access', () => {
  it("returns 404 for another creator's content on every method", async () => {
    const maya = await signIn('maya');
    const mine = await findByTitle(maya, 'Sourdough');
    const { cookie: riley } = await register();

    expect((await api.get(riley, mine.id)).status).toBe(404);
    expect((await api.patch(riley, mine.id, bodyFrom(mine, { title: 'hijacked' }))).status).toBe(404);
    expect((await api.publish(riley, mine.id)).status).toBe(404);
    expect((await api.unpublish(riley, mine.id)).status).toBe(404);
    expect((await api.cancelIntent(riley, mine.id)).status).toBe(404);
    expect((await api.del(riley, mine.id)).status).toBe(404);
    expect((await api.get(maya, mine.id)).json.title).toBe(mine.title); // untouched
  });

  it("shows a new creator an empty dashboard, never someone else's data", async () => {
    const { cookie: riley } = await register();
    expect((await api.list(riley)).json.total).toBe(0);
    expect((await api.purchases(riley)).json.total).toBe(0);
    const o = (await api.overview(riley)).json;
    expect(o.stats.totalRevenueCents).toBe(0);
    expect(o.stats.totalContent).toBe(0);
  });

  it("refuses to attach another creator's upload to your content", async () => {
    const maya = await signIn('maya');
    const mayaVideo = await uploadVideo(maya, { waitUntilReady: true });
    const { cookie: riley } = await register();
    const res = await api.create(riley, completeBody(mayaVideo));
    expect(res.status).toBe(400);
    expect(res.json.error.details.fields.video).toBeTruthy();
    expect((await api.uploadGet(riley, mayaVideo.uploadId)).status).toBe(404);
    expect((await api.uploadComplete(riley, mayaVideo.uploadId)).status).toBe(404);
  });

  it('requires a session (401) and ignores any creator id supplied by the client', async () => {
    expect((await api.list('')).status).toBe(401);
    expect((await api.me('ch_session=forged')).status).toBe(401);
    const maya = await signIn('maya');
    const res = await api.create(maya, { ...completeBody(null, { title: 'Spoof attempt' }), creatorId: 'cr_sam' });
    expect(res.status).toBe(201);
    const sam = await signIn('sam');
    expect((await api.list(sam, '?q=Spoof')).json.total).toBe(0);
  });

  it('deleting content keeps purchase history (receipts) intact', async () => {
    const maya = await signIn('maya');
    const item = await findByTitle(maya, 'Sourdough');
    const before = (await api.purchases(maya)).json.total;
    expect((await api.del(maya, item.id)).status).toBe(200);
    expect((await api.get(maya, item.id)).status).toBe(404);
    expect((await api.purchases(maya)).json.total).toBe(before);
  });
});

describe('uploads', () => {
  it('validates type and size at init (server-authoritative)', async () => {
    const maya = await signIn('maya');
    const gb = 1024 ** 3;
    const bad = await api.uploadInit(maya, { fileName: 'notes.pdf', sizeBytes: 1000, contentType: 'application/pdf' });
    expect(bad.status).toBe(400);
    expect(bad.json.error.details.fields.fileName).toMatch(/Unsupported/);
    const huge = await api.uploadInit(maya, { fileName: 'big.mp4', sizeBytes: 11 * gb, contentType: 'video/mp4' });
    expect(huge.status).toBe(400);
    const ok = await api.uploadInit(maya, { fileName: 'clip.mkv', sizeBytes: 3 * gb, contentType: '' });
    expect(ok.status).toBe(201);
    expect(ok.json.simulated).toBe(true);
    expect(ok.json.partCount).toBe(Math.ceil((3 * gb) / ok.json.partSizeBytes));
  });

  it('cannot publish while the upload is unfinished (uploading)', async () => {
    const maya = await signIn('maya');
    const init = await api.uploadInit(maya, { fileName: 'a.mp4', sizeBytes: 5_000_000, contentType: 'video/mp4' });
    const video = { uploadId: init.json.uploadId, fileName: 'a.mp4', sizeBytes: 5_000_000, durationSec: 10 };
    const created = await api.create(maya, completeBody(video));
    expect(created.status).toBe(201);
    const res = await api.publish(maya, created.json.id as string);
    expect(res.status).toBe(409);
    expect(res.json.error.details.blockers.map((b: any) => b.code)).toContain('VIDEO_UPLOADING');
  });

  it('cannot publish a FAILED / aborted upload, and a failed upload cannot be completed', async () => {
    const maya = await signIn('maya');
    const init = await api.uploadInit(maya, { fileName: 'a.mp4', sizeBytes: 5_000_000, contentType: 'video/mp4' });
    await api.uploadAbort(maya, init.json.uploadId);
    expect((await api.uploadGet(maya, init.json.uploadId)).json.state).toBe('failed');
    expect((await api.uploadComplete(maya, init.json.uploadId)).status).toBe(409);

    const video = { uploadId: init.json.uploadId, fileName: 'a.mp4', sizeBytes: 5_000_000, durationSec: 10 };
    const created = await api.create(maya, completeBody(video));
    const res = await api.publish(maya, created.json.id as string);
    expect(res.status).toBe(409);
    expect(res.json.error.details.blockers.map((b: any) => b.code)).toContain('VIDEO_FAILED');
    expect(res.json.error.details.deferrable).toBe(false);
  });

  it('moves uploading -> processing -> ready, and publishing works only when ready', async () => {
    const maya = await signIn('maya');
    const video = await uploadVideo(maya);
    expect((await api.uploadGet(maya, video.uploadId)).json.state).toBe('processing');
    const draft = await api.create(maya, completeBody(video));
    expect((await api.publish(maya, draft.json.id as string)).status).toBe(409);
    advance(7_000);
    expect((await api.uploadGet(maya, video.uploadId)).json.state).toBe('ready');
    expect((await api.publish(maya, draft.json.id as string)).status).toBe(200);
  });

  it('demo "fail next upload" is one-shot and only signals the client', async () => {
    const maya = await signIn('maya');
    await demo(maya, { action: 'fail-next-upload', enabled: true });
    const first = await api.uploadInit(maya, { fileName: 'a.mp4', sizeBytes: 5_000_000, contentType: 'video/mp4' });
    const second = await api.uploadInit(maya, { fileName: 'b.mp4', sizeBytes: 5_000_000, contentType: 'video/mp4' });
    expect(first.json.simulateInterruption).toBe(true);
    expect(second.json.simulateInterruption).toBe(false);
  });
});
