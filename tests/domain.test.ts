import { describe, expect, it } from 'vitest';
import { buildSeed, SEEDED } from '@/server/seed';
import { computeOverview, purchaseStats } from '@/server/domain/analytics';
import { canPublish, effectiveUploadState, planTransition } from '@/server/domain/publishing';
import { PROCESSING_MS } from '@/lib/constants';
import { validateScheduleTime } from '@/lib/schemas';
import type { Content, Creator, Purchase, Upload } from '@/lib/types';

const NOW = new Date('2026-10-10T09:00:00.000Z');
const db = buildSeed(NOW);
const maya = db.creators.find((c) => c.id === SEEDED.maya)!;
const sam = db.creators.find((c) => c.id === SEEDED.sam)!;
const draftOf = (creatorId: string, title: string) => db.content.find((c) => c.creatorId === creatorId && c.title.includes(title))!;
const uploadOf = (c: Content) => db.uploads.find((u) => u.id === c.video?.uploadId);

describe('seed data', () => {
  it('meets the brief: >=12 content, >=20 purchases, multiple statuses of each', () => {
    expect(db.content.length).toBeGreaterThanOrEqual(12);
    expect(db.purchases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(db.content.map((c) => c.status))).toEqual(new Set(['published', 'draft', 'scheduled']));
    expect(new Set(db.purchases.map((p) => p.status))).toEqual(new Set(['completed', 'pending', 'refunded', 'failed']));
  });

  it('is deterministic for a given date and relative to "now"', () => {
    expect(JSON.stringify(buildSeed(NOW))).toBe(JSON.stringify(buildSeed(NOW)));
    const later = buildSeed(new Date('2027-03-01T00:00:00Z'));
    const newest = later.purchases.map((p) => p.createdAt).sort().pop()!;
    expect(Date.parse(newest)).toBeGreaterThan(Date.parse('2027-02-27T00:00:00Z'));
  });

  it('keeps every record referentially consistent', () => {
    for (const c of db.content) {
      expect(db.creators.some((x) => x.id === c.creatorId)).toBe(true);
      if (c.video) expect(db.uploads.some((u) => u.id === c.video!.uploadId)).toBe(true);
    }
    for (const p of db.purchases) expect(db.content.some((c) => c.id === p.contentId)).toBe(true);
    expect(db.purchases.every((p) => p.creatorId === SEEDED.maya)).toBe(true);
  });
});

describe('canPublish', () => {
  const c = draftOf(SEEDED.maya, 'Travel Edit Pack');
  it('is ok for a verified creator with a ready video and complete details', () => {
    expect(canPublish({ creator: maya, content: c, upload: uploadOf(c), now: NOW }).ok).toBe(true);
  });
  it('reports a verification blocker for each non-verified state', () => {
    const codes = (status: Creator['verification']['status']) =>
      canPublish({ creator: { ...maya, verification: { ...maya.verification, status } }, content: c, upload: uploadOf(c), now: NOW }).blockers.map((b) => b.code);
    expect(codes('unverified')).toEqual(['VERIFICATION_REQUIRED']);
    expect(codes('pending_review')).toEqual(['VERIFICATION_PENDING']);
    expect(codes('rejected')).toEqual(['VERIFICATION_REJECTED']);
  });
  it('is not deferrable when the content itself is incomplete', () => {
    const empty = draftOf(SEEDED.sam, 'My First Tutorial');
    const r = canPublish({ creator: sam, content: empty, upload: undefined, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.deferrable).toBe(false);
  });
});

describe('effectiveUploadState (timer-based processing)', () => {
  const base: Upload = { id: 'u', creatorId: 'x', fileName: 'a.mp4', sizeBytes: 1, contentType: 'video/mp4', status: 'uploaded', createdAt: NOW.toISOString(), uploadedAt: NOW.toISOString(), processingFails: false };
  it('walks through the states', () => {
    expect(effectiveUploadState(undefined, NOW)).toBeNull();
    expect(effectiveUploadState({ ...base, status: 'initiated', uploadedAt: null }, NOW)).toBe('uploading');
    expect(effectiveUploadState(base, NOW)).toBe('processing');
    expect(effectiveUploadState(base, new Date(NOW.getTime() + PROCESSING_MS))).toBe('ready');
    expect(effectiveUploadState({ ...base, processingFails: true }, new Date(NOW.getTime() + PROCESSING_MS))).toBe('failed');
    expect(effectiveUploadState({ ...base, status: 'failed' }, NOW)).toBe('failed');
  });
});

describe('planTransition', () => {
  it('does nothing for a published item or a not-yet-due schedule', () => {
    expect(planTransition(draftOf(SEEDED.maya, 'Sourdough'), { creator: maya, upload: undefined, now: NOW })).toBeNull();
    const scheduled = draftOf(SEEDED.maya, 'Time-lapse');
    expect(planTransition(scheduled, { creator: maya, upload: uploadOf(scheduled), now: NOW })).toBeNull();
  });
  it('is pure: never mutates its input', () => {
    const scheduled = { ...draftOf(SEEDED.maya, 'Time-lapse') };
    const frozen = JSON.stringify(scheduled);
    const later = new Date(NOW.getTime() + 30 * 86_400_000);
    const next = planTransition(scheduled, { creator: maya, upload: uploadOf(scheduled), now: later });
    expect(next?.status).toBe('published');
    expect(JSON.stringify(scheduled)).toBe(frozen);
  });
});

describe('validateScheduleTime', () => {
  it('needs a valid time at least 5 minutes ahead', () => {
    expect(validateScheduleTime(null, NOW)).toBeTruthy();
    expect(validateScheduleTime('garbage', NOW)).toBeTruthy();
    expect(validateScheduleTime('2026-10-10T09:04:00Z', NOW)).toMatch(/5 minutes/);
    expect(validateScheduleTime('2026-10-10T09:06:00Z', NOW)).toBeNull();
  });
});

describe('analytics', () => {
  const p = (over: Partial<Purchase>): Purchase => ({ id: 'p', creatorId: 'c', contentId: 'x', contentTitle: 't', amountCents: 1000, country: 'US', status: 'completed', createdAt: '2026-10-05T10:00:00.000Z', ...over });
  it('counts only completed purchases as revenue', () => {
    const purchases = [p({}), p({ status: 'refunded' }), p({ status: 'failed' }), p({ status: 'pending' })];
    const o = computeOverview({ content: [], purchases, now: NOW, range: 7 });
    expect(o.stats.totalRevenueCents).toBe(1000);
    expect(o.stats.totalPurchases).toBe(1);
    expect(purchaseStats(purchases).get('x')).toEqual({ purchases: 1, revenueCents: 1000 });
  });
  it('compares month-to-date with the same window last month', () => {
    const purchases = [
      p({ createdAt: '2026-10-02T10:00:00Z', amountCents: 3000 }), // this month
      p({ createdAt: '2026-09-02T10:00:00Z', amountCents: 2000 }), // same window last month
      p({ createdAt: '2026-09-25T10:00:00Z', amountCents: 9000 }), // later last month: must NOT be compared
    ];
    const o = computeOverview({ content: [], purchases, now: NOW, range: 30 });
    expect(o.stats.revenueThisMonthCents).toBe(3000);
    expect(o.stats.revenueSamePeriodLastMonthCents).toBe(2000);
    expect(o.stats.revenueDeltaPct).toBe(50);
  });
  it('returns a zero-filled daily series of the requested length', () => {
    const o = computeOverview({ content: [], purchases: [], now: NOW, range: 30 });
    expect(o.series).toHaveLength(30);
    expect(o.series.at(-1)!.date).toBe('2026-10-10');
    expect(o.stats.revenueDeltaPct).toBeNull();
  });
});
