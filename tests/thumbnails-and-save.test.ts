import { describe, expect, it } from 'vitest';
import { THUMBNAIL_URL_PATTERN } from '@/lib/schemas';
import { api, completeBody, findByTitle, signIn, uploadVideo, useFreshApp } from './helpers';

useFreshApp();

describe('generated thumbnail references and save-before-publish', () => {
  it('assigns a stable /thumbs/ path on create', async () => {
    const sam = await signIn('sam');
    const video = await uploadVideo(sam, { waitUntilReady: true });
    const res = await api.create(sam, completeBody(video, { thumbnailUrl: '/thumbs/frame-dusk' }));
    expect(res.status).toBe(201);
    expect(res.json.thumbnailUrl).toBe('/thumbs/frame-dusk');
    expect(THUMBNAIL_URL_PATTERN.test(res.json.thumbnailUrl)).toBe(true);
  });

  it('defaults to /thumbs/{contentId} when no thumbnail is sent', async () => {
    const sam = await signIn('sam');
    const video = await uploadVideo(sam, { waitUntilReady: true });
    const res = await api.create(sam, completeBody(video, { thumbnailUrl: null }));
    expect(res.status).toBe(201);
    expect(res.json.thumbnailUrl).toBe(`/thumbs/${res.json.id}`);
  });

  it('rejects data URL thumbnails', async () => {
    const sam = await signIn('sam');
    const video = await uploadVideo(sam, { waitUntilReady: true });
    const res = await api.create(sam, completeBody(video, { thumbnailUrl: 'data:image/jpeg;base64,AAAA' }));
    expect(res.status).toBe(400);
    expect(res.json.error.details.fields.thumbnailUrl).toMatch(/Thumbnail/);
  });

  it('keeps thumbnail and metadata when publish is blocked for verification', async () => {
    const sam = await signIn('sam');
    const video = await uploadVideo(sam, { waitUntilReady: true });
    const created = await api.create(sam, completeBody(video, { title: 'Blocked publish thumb', thumbnailUrl: '/thumbs/frame-reef' }));
    expect(created.status).toBe(201);
    const id = created.json.id as string;
    const pub = await api.publish(sam, id);
    expect(pub.status).toBe(403);
    const stored = await api.get(sam, id);
    expect(stored.json.thumbnailUrl).toBe('/thumbs/frame-reef');
    expect(stored.json.title).toBe('Blocked publish thumb');
    expect(stored.json.status).toBe('draft');
  });

  it('updates the same record on patch (no duplicate) after create', async () => {
    const sam = await signIn('sam');
    const video = await uploadVideo(sam, { waitUntilReady: true });
    const created = await api.create(sam, completeBody(video, { title: 'First title' }));
    const id = created.json.id as string;
    const updated = await api.patch(sam, id, completeBody(video, { title: 'Second title', thumbnailUrl: '/thumbs/frame-ember' }));
    expect(updated.status).toBe(200);
    expect((await api.list(sam)).json.total).toBeGreaterThanOrEqual(1);
    const again = await api.get(sam, id);
    expect(again.json.title).toBe('Second title');
    expect(again.json.thumbnailUrl).toBe('/thumbs/frame-ember');
  });

  it('seeded Maya content still has /thumbs/ references', async () => {
    const maya = await signIn('maya');
    const item = await findByTitle(maya, 'Sourdough');
    expect(item.thumbnailUrl).toMatch(/^\/thumbs\//);
  });
});
