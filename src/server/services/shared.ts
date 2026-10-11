import { randomBytes } from 'node:crypto';
import type { Blocker, Content, ContentView, Creator, CreatorView, Database } from '@/lib/types';
import { ApiError, notFound } from '../errors';
import { canPublish, effectiveUploadState } from '../domain/publishing';

export const newId = (prefix: string) => `${prefix}_${randomBytes(5).toString('hex')}`;

export function getCreator(db: Readonly<Database>, id: string): Creator {
  const creator = db.creators.find((c) => c.id === id);
  if (!creator) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in again');
  return creator;
}

/** Ownership is enforced HERE, by always filtering on creatorId. Another creator's id is simply "not found". */
export function getOwnedContent(db: Readonly<Database>, creatorId: string, id: string): Content {
  const content = db.content.find((c) => c.id === id && c.creatorId === creatorId);
  if (!content) throw notFound('Content');
  return content;
}

export function toCreatorView(c: Creator): CreatorView {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    verification: {
      status: c.verification.status,
      submittedAt: c.verification.submittedAt,
      reviewedAt: c.verification.reviewedAt,
      rejectionReason: c.verification.rejectionReason,
    },
  };
}

/** `content` must already be resolved (see resolveContent) so the view shows the effective status. */
export function toContentView(
  db: Readonly<Database>,
  content: Content,
  now: Date,
  stats: Map<string, { purchases: number; revenueCents: number }>,
): ContentView {
  const { creatorId, video, ...rest } = content;
  const creator = db.creators.find((c) => c.id === creatorId)!;
  const upload = video ? db.uploads.find((u) => u.id === video.uploadId) : undefined;
  const s = stats.get(content.id) ?? { purchases: 0, revenueCents: 0 };
  // Published content is live: nothing blocks it. Everything else reports what is in the way.
  const blockers: Blocker[] = content.status === 'published' ? [] : canPublish({ creator, content, upload, now }).blockers;
  const waitingOn: Blocker[] = content.publishIntent ? blockers : [];
  return {
    ...rest,
    purchases: s.purchases,
    revenueCents: s.revenueCents,
    video: video ? { ...video, state: effectiveUploadState(upload, now) ?? 'failed' } : null,
    waitingOn,
    blockers,
  };
}
