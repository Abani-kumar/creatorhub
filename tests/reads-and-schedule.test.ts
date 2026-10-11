import { describe, expect, it } from 'vitest';
import { advance, api, bodyFrom, demo, findByTitle, signIn, store, useFreshApp } from './helpers';

useFreshApp();

const snapshot = () => store.read((db) => JSON.stringify(db));

describe('GET requests are read-only', () => {
  it('never change the database, even when scheduled items are due', async () => {
    advance(10 * 24 * 3600 * 1000); // both seeded scheduled items are now overdue
    const maya = await signIn('maya'); // (sessions expire after 7 days, so sign in after the jump)
    const before = await snapshot();
    const writes = store.stats.writes;

    const list = await api.list(maya, '?pageSize=50');
    await api.get(maya, (list.json.items[0] as any).id);
    await api.overview(maya);
    await api.purchases(maya);
    await api.me(maya);

    expect(store.stats.writes).toBe(writes);
    expect(await snapshot()).toBe(before);
  });
});

describe('scheduled publishing (no worker: computed on read, persisted by an explicit job)', () => {
  it('shows a due scheduled item as published without writing, then persists on the next write', async () => {
    const maya = await signIn('maya');
    const item = await findByTitle(maya, 'Documentary Interviews');
    expect(item.status).toBe('scheduled');

    advance(4 * 24 * 3600 * 1000); // seeded for ~3 days ahead
    expect((await api.get(maya, item.id)).json.status).toBe('published');
    expect(await store.read((db) => db.content.find((c) => c.id === item.id)!.status)).toBe('scheduled');

    // any write request first brings the saved state up to date
    await api.create(maya, { title: 'Just a draft', description: '', priceCents: null, thumbnailUrl: null, video: null, status: 'draft', scheduledFor: null });
    expect(await store.read((db) => db.content.find((c) => c.id === item.id)!.status)).toBe('published');
  });

  it('re-checks verification when the scheduled time arrives', async () => {
    const maya = await signIn('maya');
    const item = await findByTitle(maya, 'Time-lapse');
    await demo(maya, { action: 'set-verification', status: 'unverified' }); // revoked after scheduling
    advance(10 * 24 * 3600 * 1000);
    const again = await signIn('maya');
    const after = (await api.get(again, item.id)).json;
    expect(after.status).toBe('draft');
    expect(after.lastPublishError!.code).toBe('VERIFICATION_REQUIRED');
  });

  it('scheduling then editing the time keeps it scheduled', async () => {
    const maya = await signIn('maya');
    const item = await findByTitle(maya, 'Documentary Interviews');
    const later = new Date(Date.parse('2026-10-30T10:00:00Z')).toISOString();
    const res = await api.patch(maya, item.id, bodyFrom(item, { scheduledFor: later }));
    expect(res.json.status).toBe('scheduled');
    expect(res.json.scheduledFor).toBe(later);
  });

  it('keeps the dashboard numbers consistent with effective status', async () => {
    const maya = await signIn('maya');
    const before = (await api.overview(maya)).json.stats.contentByStatus;
    expect(before).toEqual({ published: 9, draft: 3, scheduled: 2 });
    advance(4 * 24 * 3600 * 1000);
    const after = (await api.overview(maya)).json.stats.contentByStatus;
    expect(after).toEqual({ published: 10, draft: 3, scheduled: 1 });
  });
});
