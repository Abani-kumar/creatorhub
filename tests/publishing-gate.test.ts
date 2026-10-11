import { describe, expect, it } from 'vitest';
import { api, bodyFrom, completeBody, demo, findByTitle, signIn, uploadVideo, useFreshApp } from './helpers';

useFreshApp();

describe('publishing rule: an unverified creator cannot publish or schedule', () => {
  it('lets an unverified creator create a DRAFT', async () => {
    const sam = await signIn('sam');
    const video = await uploadVideo(sam, { waitUntilReady: true });
    const res = await api.create(sam, completeBody(video, { status: 'draft' }));
    expect(res.status).toBe(201);
    expect(res.json.status).toBe('draft');
  });

  it('create always saves a draft; publish is blocked separately for unverified creators', async () => {
    const sam = await signIn('sam');
    const video = await uploadVideo(sam, { waitUntilReady: true });
    const created = await api.create(sam, completeBody(video, { status: 'published' }));
    expect(created.status).toBe(201);
    expect(created.json.status).toBe('draft');
    expect(created.json.thumbnailUrl).toMatch(/^\/thumbs\//);
    const pub = await api.publish(sam, created.json.id as string);
    expect(pub.status).toBe(403);
    expect(pub.json.error.code).toBe('VERIFICATION_REQUIRED');
    expect(pub.json.error.details.verificationStatus).toBe('unverified');
    expect(pub.json.error.details.deferrable).toBe(true);
    expect((await api.get(sam, created.json.id as string)).json.thumbnailUrl).toBe(created.json.thumbnailUrl);
  });

  it('blocks schedule via publish endpoint when unverified (403)', async () => {
    const sam = await signIn('sam');
    const video = await uploadVideo(sam, { waitUntilReady: true });
    const when = new Date(Date.parse('2026-10-12T10:00:00Z')).toISOString();
    const draft = await api.create(sam, completeBody(video));
    const res = await api.publish(sam, draft.json.id as string, { scheduledFor: when });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe('VERIFICATION_REQUIRED');
  });

  it('blocks EDIT (PATCH) from draft to published', async () => {
    const sam = await signIn('sam');
    const draft = await findByTitle(sam, 'Pottery');
    const res = await api.patch(sam, draft.id, bodyFrom(draft, { status: 'published' }));
    expect(res.status).toBe(403);
    expect((await api.get(sam, draft.id)).json.status).toBe('draft');
  });

  it('blocks the DEDICATED publish endpoint, for publish-now and for schedule', async () => {
    const sam = await signIn('sam');
    const draft = await findByTitle(sam, 'Pottery');
    expect((await api.publish(sam, draft.id)).status).toBe(403);
    const when = new Date(Date.parse('2026-10-12T10:00:00Z')).toISOString();
    expect((await api.publish(sam, draft.id, { scheduledFor: when })).status).toBe(403);
    expect((await api.get(sam, draft.id)).json.status).toBe('draft');
  });

  it.each(['pending_review', 'rejected'] as const)('stays blocked while verification is %s', async (status) => {
    const sam = await signIn('sam');
    await demo(sam, { action: 'set-verification', status });
    const draft = await findByTitle(sam, 'Pottery');
    const res = await api.publish(sam, draft.id);
    expect(res.status).toBe(403);
    expect(res.json.error.details.verificationStatus).toBe(status);
  });

  it('allows a verified creator to publish via every path', async () => {
    const maya = await signIn('maya');
    const draft = await findByTitle(maya, 'Travel Edit Pack');
    const res = await api.publish(maya, draft.id);
    expect(res.status).toBe(200);
    expect(res.json.status).toBe('published');

    const sound = await findByTitle(maya, 'Sound Design');
    const edited = await api.patch(maya, sound.id, bodyFrom(sound, { status: 'published' }));
    expect(edited.status).toBe(200);
    expect(edited.json.status).toBe('published');

    const video = await uploadVideo(maya, { waitUntilReady: true });
    const created = await api.create(maya, completeBody(video));
    expect(created.status).toBe(201);
    const published = await api.publish(maya, created.json.id as string);
    expect(published.status).toBe(200);
    expect(published.json.status).toBe('published');
  });

  it('verified creators can schedule in the future but not in the past or <5 minutes ahead', async () => {
    const maya = await signIn('maya');
    const video = await uploadVideo(maya, { waitUntilReady: true });
    const future = new Date(Date.parse('2026-10-15T10:00:00Z')).toISOString();
    const draft = await api.create(maya, completeBody(video));
    const ok = await api.publish(maya, draft.json.id as string, { scheduledFor: future });
    expect(ok.status).toBe(200);
    expect(ok.json.status).toBe('scheduled');

    const soon = new Date(Date.parse('2026-10-10T09:02:00Z')).toISOString();
    const draft2 = await api.create(maya, completeBody(video));
    const bad = await api.publish(maya, draft2.json.id as string, { scheduledFor: soon });
    expect(bad.status).toBe(400);
    expect(bad.json.error.details.fields.scheduledFor).toMatch(/5 minutes/);
  });

  it('refuses to publish incomplete content even for a verified creator', async () => {
    const maya = await signIn('maya');
    const incomplete = await findByTitle(maya, 'Lighting for Small Spaces');
    const res = await api.publish(maya, incomplete.id);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe('PUBLISH_NOT_READY');
    expect(res.json.error.details.blockers.map((b: any) => b.code)).toContain('CONTENT_INCOMPLETE');
  });

  it('create validation: published needs a complete record (400 with field errors)', async () => {
    const maya = await signIn('maya');
    const res = await api.create(maya, { title: 'Hi', description: '', priceCents: null, thumbnailUrl: null, video: null, status: 'published', scheduledFor: null });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('VALIDATION_FAILED');
    const fields = res.json.error.details.fields;
    expect(Object.keys(fields)).toEqual(expect.arrayContaining(['title', 'description', 'priceCents', 'thumbnailUrl', 'video']));
  });

  it('unpublish returns content to draft', async () => {
    const maya = await signIn('maya');
    const live = await findByTitle(maya, 'Sourdough');
    const res = await api.unpublish(maya, live.id);
    expect(res.json.status).toBe('draft');
  });

  it('editing live content stays allowed if the creator is later un-verified, but a new publish is not', async () => {
    const maya = await signIn('maya');
    const live = await findByTitle(maya, 'Sourdough');
    await demo(maya, { action: 'set-verification', status: 'unverified' });
    const edit = await api.patch(maya, live.id, bodyFrom(live, { title: 'Sourdough, updated' }));
    expect(edit.status).toBe(200);
    expect(edit.json.status).toBe('published');
    const draft = await findByTitle(maya, 'Travel Edit Pack');
    expect((await api.publish(maya, draft.id)).status).toBe(403);
  });

});
