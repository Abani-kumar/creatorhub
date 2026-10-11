import { describe, expect, it } from 'vitest';
import { THUMBNAIL_URL_PATTERN } from '@/lib/schemas';
import { parseCookies } from '@/server/http';
import { api, bodyFrom, completeBody, demo, findByTitle, register, signIn, uploadVideo, useFreshApp } from './helpers';

useFreshApp();

describe('thumbnail URL validation (shared schema, enforced on the server)', () => {
  it.each([
    '/thumbs/cnt_01',
    '/thumbs/frame-aurora',
    '/thumbs/cover-abc123',
  ])('accepts %s', (url) => {
    expect(THUMBNAIL_URL_PATTERN.test(url)).toBe(true);
  });

  it.each([
    'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    'data:image/png;base64,iVBORw0KGgo=',
    'https://evil.example/pixel.gif',
    'http://tracker.test/a.png',
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    '//evil.example/x.png',
    '/thumbs/../../etc/passwd',
    '',
  ])('rejects %s', (url) => {
    expect(THUMBNAIL_URL_PATTERN.test(url)).toBe(false);
  });

  it('is rejected by the API with a field error, not stored', async () => {
    const sam = await signIn('sam');
    const video = await uploadVideo(sam, { waitUntilReady: true });
    const res = await api.create(sam, completeBody(video, { thumbnailUrl: 'https://evil.example/pixel.gif' }));
    expect(res.status).toBe(400);
    expect(res.json.error.details.fields.thumbnailUrl).toMatch(/Thumbnail/);
  });
});

describe('ContentView.blockers', () => {
  it('lists why an unverified creator\'s draft cannot go live, with no blockers once published', async () => {
    const sam = await signIn('sam');
    const draft = await findByTitle(sam, 'Pottery');
    const codes = draft.blockers.map((b) => b.code);
    expect(codes).toContain('VERIFICATION_REQUIRED');
    // This seeded draft has a ready video and complete metadata, so verification is the only blocker.
    expect(codes).toEqual(['VERIFICATION_REQUIRED']);

    const maya = await signIn('maya');
    const live = await findByTitle(maya, 'Sourdough');
    expect(live.status).toBe('published');
    expect(live.blockers).toEqual([]);
  });

  it('reports missing details and a missing video for an incomplete draft', async () => {
    const maya = await signIn('maya');
    const incomplete = await findByTitle(maya, 'Lighting for Small Spaces');
    const codes = incomplete.blockers.map((b) => b.code);
    expect(codes).toContain('CONTENT_INCOMPLETE');
    expect(codes).toContain('VIDEO_MISSING');
    expect(codes).not.toContain('VERIFICATION_REQUIRED');
  });

  it('tracks a failed upload as a non-deferrable video blocker', async () => {
    const maya = await signIn('maya');
    await demo(maya, { action: 'fail-next-processing', enabled: true });
    const video = await uploadVideo(maya, { waitUntilReady: true });
    const created = await api.create(maya, completeBody(video));
    expect(created.status).toBe(201);
    expect(created.json.blockers.map((b: { code: string }) => b.code)).toEqual(['VIDEO_FAILED']);
  });
});

describe('purchases can be narrowed to one content item, never across creators', () => {
  it('filters by contentId for the owner', async () => {
    const maya = await signIn('maya');
    const item = await findByTitle(maya, 'Sourdough');
    const res = await api.purchases(maya, `?contentId=${item.id}&pageSize=50`);
    expect(res.status).toBe(200);
    expect(res.json.total).toBeGreaterThan(0);
    expect(res.json.items.every((p: { contentId: string }) => p.contentId === item.id)).toBe(true);
  });

  it('returns nothing (not the owner\'s rows) when another creator passes that contentId', async () => {
    const maya = await signIn('maya');
    const item = await findByTitle(maya, 'Sourdough');
    const { cookie: riley } = await register();
    const res = await api.purchases(riley, `?contentId=${item.id}`);
    expect(res.status).toBe(200);
    expect(res.json.total).toBe(0);
    expect(res.json.items).toEqual([]);
  });
});

describe('cookie parsing is defensive', () => {
  it('does not throw on malformed percent-encoding', () => {
    expect(() => parseCookies('ch_session=%E0%A4%A; other=ok')).not.toThrow();
    expect(parseCookies('other=a%20b').other).toBe('a b');
  });

  it('treats a garbage session cookie as unauthenticated (401), not a server error', async () => {
    const res = await api.me('ch_session=%E0%A4%A');
    expect(res.status).toBe(401);
  });
});

describe('editing keeps blockers in sync', () => {
  it('drops the incomplete-content blocker once the missing details are filled in', async () => {
    const maya = await signIn('maya');
    const draft = await findByTitle(maya, 'Lighting for Small Spaces');
    const video = await uploadVideo(maya, { waitUntilReady: true });
    const res = await api.patch(maya, draft.id, bodyFrom(draft, {
      description: 'Now this description is long enough.', priceCents: 1500, thumbnailUrl: '/thumbs/lighting', video, status: 'draft',
    }));
    expect(res.status).toBe(200);
    expect(res.json.blockers).toEqual([]);
  });
});
