import type { VerificationSubmitInput } from '@/lib/schemas';
import type { CreatorView, Database, VerificationStatus, VerificationView } from '@/lib/types';
import { ApiError } from '../errors';
import { runDueJobs } from '../domain/jobs';
import { getCreator, toCreatorView } from './shared';

export function getVerification(db: Readonly<Database>, creatorId: string): VerificationView {
  const v = getCreator(db, creatorId).verification;
  const sub = v.submission;
  return {
    status: v.status,
    submittedAt: v.submittedAt,
    reviewedAt: v.reviewedAt,
    rejectionReason: v.rejectionReason,
    submission: sub
      ? { fullName: sub.fullName, country: sub.country, documentType: sub.documentType, documentFileName: sub.documentFileName, selfieMethod: sub.selfieMethod }
      : null,
  };
}

/**
 * The creator-facing endpoint can only ever move unverified/rejected -> pending_review.
 * It can NEVER produce "verified": approval comes from a reviewer / identity provider webhook in production
 * and from the DEMO_MODE-gated demo actions below here.
 */
export function submitVerification(db: Database, creatorId: string, input: VerificationSubmitInput, now: Date): CreatorView {
  const creator = getCreator(db, creatorId);
  const status = creator.verification.status;
  if (status === 'verified') throw new ApiError(409, 'ALREADY_VERIFIED', 'Your identity is already verified');
  if (status === 'pending_review') throw new ApiError(409, 'VERIFICATION_IN_REVIEW', 'Your verification is already under review');

  const ts = now.toISOString();
  creator.verification = {
    status: 'pending_review',
    submission: {
      fullName: input.personal.fullName, dateOfBirth: input.personal.dateOfBirth, country: input.personal.country,
      addressLine: input.personal.addressLine, city: input.personal.city, postalCode: input.personal.postalCode,
      documentType: input.document.type, documentFileName: input.document.fileName, documentSizeBytes: input.document.sizeBytes,
      selfieMethod: input.selfie.method, selfieCompletedAt: input.selfie.completedAt,
    },
    submittedAt: ts,
    reviewedAt: null,
    rejectionReason: null,
  };
  return toCreatorView(creator);
}

/* ------------------------- DEMO ONLY (see services/demo.ts) ------------------------- */

export function demoReview(db: Database, creatorId: string, decision: 'approve' | 'reject', reason: string | undefined, now: Date): CreatorView {
  const creator = getCreator(db, creatorId);
  if (creator.verification.status !== 'pending_review') {
    throw new ApiError(409, 'NOTHING_TO_REVIEW', 'There is no verification waiting for review');
  }
  creator.verification.reviewedAt = now.toISOString();
  if (decision === 'approve') {
    creator.verification.status = 'verified';
    creator.verification.rejectionReason = null;
  } else {
    creator.verification.status = 'rejected';
    creator.verification.rejectionReason = reason?.trim() || 'The document photo was too blurry to read. Please upload a clearer image.';
  }
  runDueJobs(db, now); // approval may satisfy explicit publish intents
  return toCreatorView(creator);
}

export function demoSetVerification(db: Database, creatorId: string, status: VerificationStatus, now: Date): CreatorView {
  const creator = getCreator(db, creatorId);
  const ts = now.toISOString();
  creator.verification = {
    status,
    submission: status === 'unverified' ? null : creator.verification.submission,
    submittedAt: status === 'unverified' ? null : creator.verification.submittedAt ?? ts,
    reviewedAt: status === 'verified' || status === 'rejected' ? ts : null,
    rejectionReason: status === 'rejected' ? 'Demo: verification marked as rejected.' : null,
  };
  runDueJobs(db, now);
  return toCreatorView(creator);
}
