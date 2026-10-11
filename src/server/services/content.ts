import type { ContentInput, ContentQuery, PublishRequest } from '@/lib/schemas';
import { validateScheduleTime } from '@/lib/schemas';
import type { Content, ContentStatus, ContentView, Database, Paginated } from '@/lib/types';
import { ApiError, notFound, validationError } from '../errors';
import { purchaseStats } from '../domain/analytics';
import { resolveContent, runDueJobs } from '../domain/jobs';
import { canPublish, type PublishCheck } from '../domain/publishing';
import { normalizeThumbnailUrl } from '@/lib/thumbnail-ref';
import { getCreator, getOwnedContent, newId, toContentView } from './shared';

/* --------------------------------- reads --------------------------------- */

export function listContent(db: Readonly<Database>, creatorId: string, q: ContentQuery, now: Date): Paginated<ContentView> {
  const stats = purchaseStats(db.purchases.filter((p) => p.creatorId === creatorId));
  const needle = q.q.toLowerCase();
  // Resolve + filter/sort on records first; build heavy ContentView (canPublish blockers) only for the current page.
  let rows = db.content
    .filter((c) => c.creatorId === creatorId)
    .map((c) => resolveContent(db, c, now))
    .filter((c) => (q.status === 'all' || c.status === q.status) && (!needle || c.title.toLowerCase().includes(needle)));

  const dir = q.order === 'asc' ? 1 : -1;
  const key: Record<ContentQuery['sort'], (c: Content) => number | string> = {
    created: (c) => c.createdAt,
    title: (c) => c.title.toLowerCase(),
    price: (c) => c.priceCents ?? -1,
    views: (c) => c.views,
    purchases: (c) => stats.get(c.id)?.purchases ?? 0,
    revenue: (c) => stats.get(c.id)?.revenueCents ?? 0,
  };
  const get = key[q.sort];
  rows = [...rows].sort((a, b) => (get(a) < get(b) ? -dir : get(a) > get(b) ? dir : 0));

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / q.pageSize));
  const page = Math.min(q.page, totalPages);
  const slice = rows.slice((page - 1) * q.pageSize, page * q.pageSize);
  const items = slice.map((c) => toContentView(db, c, now, stats));
  return { items, page, pageSize: q.pageSize, total, totalPages };
}

export function getContentView(db: Readonly<Database>, creatorId: string, id: string, now: Date): ContentView {
  const content = resolveContent(db, getOwnedContent(db, creatorId, id), now);
  const stats = purchaseStats(db.purchases.filter((p) => p.creatorId === creatorId));
  return toContentView(db, content, now, stats);
}

/* ------------------------------ the one gate ------------------------------ */

interface Desired {
  status: ContentStatus;
  scheduledFor: string | null;
  publishWhenReady: boolean;
}

function blockedError(check: PublishCheck, verificationStatus: string) {
  const verification = check.blockers.find((b) => b.code.startsWith('VERIFICATION'));
  const details = { blockers: check.blockers, deferrable: check.deferrable, verificationStatus };
  if (verification) return new ApiError(403, 'VERIFICATION_REQUIRED', verification.message, details);
  return new ApiError(409, 'PUBLISH_NOT_READY', check.blockers[0].message, details);
}

const DRAFT_DESIRED: Desired = { status: 'draft', scheduledFor: null, publishWhenReady: false };

function isDeferrablePublishBlock(e: unknown, desired: Desired): boolean {
  if (!(e instanceof ApiError)) return false;
  if (desired.status === 'draft' || desired.publishWhenReady) return false;
  if (e.code !== 'VERIFICATION_REQUIRED' && e.code !== 'PUBLISH_NOT_READY') return false;
  return e.details?.deferrable === true;
}

/**
 * Create, edit and the dedicated publish endpoint ALL call this. It is the single place where the
 * rule "an unverified creator cannot publish (or schedule)" is enforced, so no path can bypass it.
 */
function applyDesiredStatus(db: Database, creatorId: string, content: Content, desired: Desired, now: Date): Content {
  const creator = getCreator(db, creatorId);
  const ts = now.toISOString();

  if (desired.status === 'draft') {
    // Saving as a draft (also "unpublish") is always allowed and explicitly cancels any pending intent.
    return { ...content, status: 'draft', scheduledFor: null, publishedAt: null, publishIntent: null, lastPublishError: null, updatedAt: ts };
  }

  if (desired.status === 'scheduled') {
    const err = validateScheduleTime(desired.scheduledFor, now);
    if (err) throw validationError({ scheduledFor: err });
  }

  const candidate: Content = { ...content, scheduledFor: desired.status === 'scheduled' ? desired.scheduledFor : null, updatedAt: ts };
  const upload = candidate.video ? db.uploads.find((u) => u.id === candidate.video!.uploadId) : undefined;
  const check = canPublish({ creator, content: candidate, upload, now });

  // Editing something that is already live is not a new publication: skip the identity gate,
  // but still never allow a half-uploaded/failed video to replace a live one.
  if (content.status === 'published' && desired.status === 'published') {
    const nonVerification = check.blockers.filter((b) => !b.code.startsWith('VERIFICATION'));
    if (nonVerification.length) throw blockedError({ ok: false, blockers: nonVerification, deferrable: false }, creator.verification.status);
    return { ...candidate, status: 'published', scheduledFor: null, publishIntent: null, lastPublishError: null };
  }

  if (check.ok) {
    return desired.status === 'published'
      ? { ...candidate, status: 'published', publishedAt: ts, scheduledFor: null, publishIntent: null, lastPublishError: null }
      : { ...candidate, status: 'scheduled', publishIntent: null, lastPublishError: null };
  }

  if (desired.publishWhenReady && check.deferrable) {
    return {
      ...candidate,
      status: 'draft',
      scheduledFor: null,
      publishedAt: null,
      publishIntent: { kind: desired.status === 'scheduled' ? 'schedule' : 'publish', scheduledFor: candidate.scheduledFor, createdAt: ts },
      lastPublishError: null,
    };
  }

  throw blockedError(check, creator.verification.status);
}

function assertVideoOwnership(db: Database, creatorId: string, video: ContentInput['video']) {
  if (!video) return;
  const upload = db.uploads.find((u) => u.id === video.uploadId && u.creatorId === creatorId);
  if (!upload) throw validationError({ video: 'Upload not found. Please upload the video again.' });
}

const view = (db: Database, creatorId: string, content: Content, now: Date) =>
  toContentView(db, content, now, purchaseStats(db.purchases.filter((p) => p.creatorId === creatorId)));

/* --------------------------------- writes --------------------------------- */
// Every write starts with runDueJobs(): saved state catches up before we change anything.

export function createContent(db: Database, creatorId: string, input: ContentInput, now: Date): ContentView {
  runDueJobs(db, now);
  assertVideoOwnership(db, creatorId, input.video);
  const ts = now.toISOString();
  const id = newId('cnt');
  const base: Content = {
    id, creatorId, title: input.title, description: input.description, priceCents: input.priceCents,
    thumbnailUrl: normalizeThumbnailUrl(input.thumbnailUrl, id), video: input.video, status: 'draft', scheduledFor: null, publishedAt: null,
    publishIntent: null, lastPublishError: null, views: 0, createdAt: ts, updatedAt: ts,
  };
  db.content.push(base);
  return view(db, creatorId, base, now);
}

/** Full update of the editable fields (the form always sends the whole record). */
export function updateContent(db: Database, creatorId: string, id: string, input: ContentInput, now: Date): ContentView {
  runDueJobs(db, now);
  const existing = getOwnedContent(db, creatorId, id);
  assertVideoOwnership(db, creatorId, input.video);
  const edited: Content = {
    ...existing, title: input.title, description: input.description, priceCents: input.priceCents,
    thumbnailUrl: normalizeThumbnailUrl(input.thumbnailUrl, id), video: input.video,
  };
  const desired: Desired = { status: input.status, scheduledFor: input.scheduledFor, publishWhenReady: !!input.publishWhenReady };
  const idx = db.content.findIndex((c) => c.id === id);
  try {
    const next = applyDesiredStatus(db, creatorId, edited, desired, now);
    db.content[idx] = next;
    return view(db, creatorId, next, now);
  } catch (e) {
    if (isDeferrablePublishBlock(e, desired) && existing.status !== 'published') {
      db.content[idx] = applyDesiredStatus(db, creatorId, edited, DRAFT_DESIRED, now);
    }
    throw e;
  }
}

/** Dedicated status-change endpoint: publish a stored draft now, or schedule it. */
export function publishContent(db: Database, creatorId: string, id: string, req: PublishRequest, now: Date): ContentView {
  runDueJobs(db, now);
  const existing = getOwnedContent(db, creatorId, id);
  if (existing.status === 'published') throw new ApiError(409, 'ALREADY_PUBLISHED', 'This content is already published');
  const next = applyDesiredStatus(db, creatorId, existing, {
    status: req.scheduledFor ? 'scheduled' : 'published',
    scheduledFor: req.scheduledFor ?? null,
    publishWhenReady: !!req.publishWhenReady,
  }, now);
  db.content[db.content.findIndex((c) => c.id === id)] = next;
  return view(db, creatorId, next, now);
}

export function unpublishContent(db: Database, creatorId: string, id: string, now: Date): ContentView {
  runDueJobs(db, now);
  const existing = getOwnedContent(db, creatorId, id);
  const next = applyDesiredStatus(db, creatorId, existing, { status: 'draft', scheduledFor: null, publishWhenReady: false }, now);
  db.content[db.content.findIndex((c) => c.id === id)] = next;
  return view(db, creatorId, next, now);
}

/** The creator changes their mind: stop waiting, keep the draft. Idempotent. */
export function cancelPublishIntent(db: Database, creatorId: string, id: string, now: Date): ContentView {
  runDueJobs(db, now);
  const existing = getOwnedContent(db, creatorId, id);
  const next: Content = { ...existing, publishIntent: null, updatedAt: now.toISOString() };
  db.content[db.content.findIndex((c) => c.id === id)] = next;
  return view(db, creatorId, next, now);
}

export function deleteContent(db: Database, creatorId: string, id: string, now: Date): { id: string } {
  runDueJobs(db, now);
  getOwnedContent(db, creatorId, id);
  db.content = db.content.filter((c) => c.id !== id);
  // Purchases are kept (they are receipts and revenue history); see README for the production note.
  return { id };
}

export { notFound };
