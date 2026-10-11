/**
 * Domain types. Three independent state machines (never one combined "status"):
 *   - Content:       draft | scheduled | published
 *   - Upload/video:  uploading | processing | ready | failed   (processing/ready/failed are derived from timestamps)
 *   - Verification:  unverified | pending_review | verified | rejected
 */

export type ContentStatus = 'draft' | 'scheduled' | 'published';
export type VerificationStatus = 'unverified' | 'pending_review' | 'verified' | 'rejected';
export type PurchaseStatus = 'completed' | 'pending' | 'refunded' | 'failed';
export type UploadState = 'uploading' | 'processing' | 'ready' | 'failed';
export type DocumentType = 'passport' | 'drivers_license' | 'national_id' | 'residence_permit';

export type BlockerCode =
  | 'VERIFICATION_REQUIRED'
  | 'VERIFICATION_PENDING'
  | 'VERIFICATION_REJECTED'
  | 'CONTENT_INCOMPLETE'
  | 'VIDEO_MISSING'
  | 'VIDEO_UPLOADING'
  | 'VIDEO_PROCESSING'
  | 'VIDEO_FAILED';

export interface Blocker {
  code: BlockerCode;
  message: string;
}

/* ----------------------------- stored entities ---------------------------- */

export interface VideoRef {
  uploadId: string;
  fileName: string;
  sizeBytes: number;
  durationSec: number | null;
}

/** Creator's explicit choice: "publish this automatically once everything is ready". */
export interface PublishIntent {
  kind: 'publish' | 'schedule';
  scheduledFor: string | null;
  createdAt: string;
}

export interface PublishError {
  code: string;
  message: string;
  at: string;
}

export interface Content {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  priceCents: number | null;
  thumbnailUrl: string | null;
  video: VideoRef | null;
  status: ContentStatus;
  scheduledFor: string | null;
  publishedAt: string | null;
  publishIntent: PublishIntent | null;
  lastPublishError: PublishError | null;
  views: number;
  createdAt: string;
  updatedAt: string;
}

export interface Upload {
  id: string;
  creatorId: string;
  fileName: string;
  sizeBytes: number;
  contentType: string;
  /** 'initiated' = multipart upload open, 'uploaded' = complete, 'failed' = aborted/failed. */
  status: 'initiated' | 'uploaded' | 'failed';
  createdAt: string;
  uploadedAt: string | null;
  /** Demo: the simulated processing step will fail for this upload. */
  processingFails: boolean;
}

export interface Purchase {
  id: string;
  creatorId: string;
  contentId: string;
  /** Snapshot taken at purchase time, like a receipt (content may later be deleted). */
  contentTitle: string;
  amountCents: number;
  country: string;
  status: PurchaseStatus;
  createdAt: string;
}

export interface VerificationSubmission {
  fullName: string;
  dateOfBirth: string;
  country: string;
  addressLine: string;
  city: string;
  postalCode: string;
  documentType: DocumentType;
  documentFileName: string;
  documentSizeBytes: number;
  selfieMethod: 'camera' | 'simulated';
  selfieCompletedAt: string;
}

export interface VerificationRecord {
  status: VerificationStatus;
  submission: VerificationSubmission | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

export interface Creator {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  verification: VerificationRecord;
}

export interface Session {
  id: string;
  creatorId: string;
  createdAt: string;
}

export interface DemoSettings {
  latencyMs: number;
  forceApiErrors: boolean;
  failNextUpload: boolean;
  failNextProcessing: boolean;
  jobsLastRunAt: string | null;
}

export interface Database {
  version: number;
  creators: Creator[];
  content: Content[];
  purchases: Purchase[];
  uploads: Upload[];
  sessions: Session[];
  demo: DemoSettings;
}

/* ------------------------------- API shapes ------------------------------- */

export interface ContentView extends Omit<Content, 'creatorId' | 'video'> {
  purchases: number;
  revenueCents: number;
  video: (VideoRef & { state: UploadState }) | null;
  /** When a publish intent is pending: what it is still waiting for. */
  waitingOn: Blocker[];
  /** Why this draft/scheduled item cannot go live right now (empty when published or ready). */
  blockers: Blocker[];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PurchaseView {
  id: string;
  createdAt: string;
  contentId: string;
  contentTitle: string;
  amountCents: number;
  country: string;
  countryName: string;
  status: PurchaseStatus;
}

export interface OverviewResponse {
  stats: {
    totalRevenueCents: number;
    revenueThisMonthCents: number;
    revenueSamePeriodLastMonthCents: number;
    /** Month-to-date vs the same days last month. null when there is nothing to compare. */
    revenueDeltaPct: number | null;
    totalContent: number;
    contentByStatus: Record<ContentStatus, number>;
    totalPurchases: number;
    purchasesThisMonth: number;
  };
  range: number;
  series: { date: string; revenueCents: number; purchases: number }[];
}

export interface CreatorView {
  id: string;
  name: string;
  email: string;
  verification: {
    status: VerificationStatus;
    submittedAt: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
  };
}

/**
 * What the owner sees about their own verification. Deliberately a SUMMARY: date of birth and address are
 * not echoed back to the browser once submitted.
 */
export interface VerificationView {
  status: VerificationStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  submission: {
    fullName: string;
    country: string;
    documentType: DocumentType;
    documentFileName: string;
    selfieMethod: 'camera' | 'simulated';
  } | null;
}

export interface MeResponse {
  creator: CreatorView;
  demoMode: boolean;
}

export interface UploadView {
  id: string;
  fileName: string;
  sizeBytes: number;
  state: UploadState;
}

export interface UploadInitResponse {
  uploadId: string;
  partSizeBytes: number;
  partCount: number;
  expiresAt: string;
  /** Always true in this demo: nothing is transmitted, see docs. */
  simulated: true;
  /** Demo control: the client should interrupt this upload part-way. */
  simulateInterruption: boolean;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
