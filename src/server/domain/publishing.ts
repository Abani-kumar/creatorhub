/**
 * THE publication rule. Every path that can move content to "published" or "scheduled"
 * (create, edit, dedicated publish endpoint, scheduled job, approval of a publish intent)
 * goes through `canPublish` / `planTransition`. There is no other way to go live.
 *
 *   canPublish = creatorIsVerified && videoIsReady && contentIsComplete
 *
 * All functions here are PURE: no I/O, no clock reads (time is passed in).
 */
import { PROCESSING_MS } from '@/lib/constants';
import type { Blocker, BlockerCode, Content, Creator, Upload, UploadState } from '@/lib/types';

export interface PublishCheck {
  ok: boolean;
  blockers: Blocker[];
  /** True when passage of time / verification could fix every blocker (so "publish when ready" is allowed). */
  deferrable: boolean;
}

const DEFERRABLE = new Set<BlockerCode>([
  'VERIFICATION_REQUIRED',
  'VERIFICATION_PENDING',
  'VERIFICATION_REJECTED',
  'VIDEO_UPLOADING',
  'VIDEO_PROCESSING',
]);

/** Upload lifecycle as seen "now". Processing is a timer in this demo (a worker in production). */
export function effectiveUploadState(upload: Upload | null | undefined, now: Date): UploadState | null {
  if (!upload) return null;
  if (upload.status === 'failed') return 'failed';
  if (upload.status === 'initiated' || !upload.uploadedAt) return 'uploading';
  const doneAt = Date.parse(upload.uploadedAt) + PROCESSING_MS;
  if (now.getTime() < doneAt) return 'processing';
  return upload.processingFails ? 'failed' : 'ready';
}

export function missingDetails(c: Pick<Content, 'title' | 'description' | 'priceCents' | 'thumbnailUrl'>): string[] {
  const missing: string[] = [];
  if (c.title.trim().length < 3) missing.push('title');
  if (c.description.trim().length < 10) missing.push('description');
  if (c.priceCents == null) missing.push('price');
  if (!c.thumbnailUrl) missing.push('thumbnail');
  return missing;
}

export function canPublish(args: {
  creator: Creator;
  content: Content;
  upload: Upload | null | undefined;
  now: Date;
}): PublishCheck {
  const { creator, content, upload, now } = args;
  const blockers: Blocker[] = [];

  switch (creator.verification.status) {
    case 'unverified':
      blockers.push({ code: 'VERIFICATION_REQUIRED', message: 'Verify your identity to publish content.' });
      break;
    case 'pending_review':
      blockers.push({ code: 'VERIFICATION_PENDING', message: 'Your identity verification is still under review.' });
      break;
    case 'rejected':
      blockers.push({ code: 'VERIFICATION_REJECTED', message: 'Your identity verification was not approved. Resubmit to publish.' });
      break;
    case 'verified':
      break;
  }

  const missing = missingDetails(content);
  if (missing.length) {
    blockers.push({ code: 'CONTENT_INCOMPLETE', message: `Add the missing details first: ${missing.join(', ')}.` });
  }

  if (!content.video) {
    blockers.push({ code: 'VIDEO_MISSING', message: 'Upload a video before publishing.' });
  } else {
    switch (effectiveUploadState(upload, now)) {
      case null:
        blockers.push({ code: 'VIDEO_MISSING', message: 'The uploaded video could not be found. Upload it again.' });
        break;
      case 'uploading':
        blockers.push({ code: 'VIDEO_UPLOADING', message: 'The video upload has not finished.' });
        break;
      case 'processing':
        blockers.push({ code: 'VIDEO_PROCESSING', message: 'The video is still being processed.' });
        break;
      case 'failed':
        blockers.push({ code: 'VIDEO_FAILED', message: 'Video upload or processing failed. Upload the video again.' });
        break;
      case 'ready':
        break;
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
    deferrable: blockers.length > 0 && blockers.every((b) => DEFERRABLE.has(b.code)),
  };
}

/**
 * What would the backend job do to this content at `now`? Returns the new state, or null for "nothing".
 * Reads apply this in memory (so a due scheduled item *looks* published without any write);
 * `runDueJobs` persists it. One function, two callers: behaviour cannot drift between them.
 */
export function planTransition(
  content: Content,
  ctx: { creator: Creator; upload: Upload | null | undefined; now: Date },
): Content | null {
  const { now } = ctx;
  const nowIso = now.toISOString();

  if (content.status === 'scheduled') {
    if (!content.scheduledFor || Date.parse(content.scheduledFor) > now.getTime()) return null;
    const check = canPublish({ ...ctx, content });
    if (check.ok) {
      return { ...content, status: 'published', publishedAt: content.scheduledFor, scheduledFor: null, lastPublishError: null };
    }
    // Re-checked at execution time: verification or the video may have changed since it was scheduled.
    return {
      ...content,
      status: 'draft',
      scheduledFor: null,
      lastPublishError: { code: check.blockers[0].code, message: `Scheduled publish failed: ${check.blockers[0].message}`, at: nowIso },
    };
  }

  if (content.status === 'draft' && content.publishIntent) {
    const intent = content.publishIntent;
    const check = canPublish({ ...ctx, content });
    if (check.ok) {
      if (intent.kind === 'schedule' && intent.scheduledFor && Date.parse(intent.scheduledFor) > now.getTime()) {
        return { ...content, status: 'scheduled', scheduledFor: intent.scheduledFor, publishIntent: null, lastPublishError: null };
      }
      return { ...content, status: 'published', publishedAt: nowIso, scheduledFor: null, publishIntent: null, lastPublishError: null };
    }
    if (!check.deferrable) {
      // Waiting will not help (e.g. processing failed): drop the intent and tell the creator why.
      return {
        ...content,
        publishIntent: null,
        lastPublishError: { code: check.blockers[0].code, message: `Could not publish automatically: ${check.blockers[0].message}`, at: nowIso },
      };
    }
  }
  return null;
}
