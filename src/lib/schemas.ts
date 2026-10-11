/**
 * Validation schemas shared by the browser (instant form feedback) and the server (authoritative).
 * The server NEVER trusts that the client ran these.
 */
import { z } from 'zod';
import {
  ALLOWED_VIDEO_EXTENSIONS,
  MAX_DOCUMENT_BYTES,
  MAX_VIDEO_BYTES,
  MIN_SCHEDULE_LEAD_MS,
  PRICE_MAX_CENTS,
  PRICE_MIN_CENTS,
} from './constants';
import { isCountryCode } from './countries';
import { THUMBNAIL_URL_PATTERN } from './thumbnail-ref';

/** Re-exported for tests and API validation messages. */
export { THUMBNAIL_URL_PATTERN };

const isoDateTime = z.string().datetime({ offset: true, message: 'Enter a valid date and time' });

/* --------------------------------- content -------------------------------- */

export const videoRefSchema = z.object({
  uploadId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  durationSec: z.number().nonnegative().nullable(),
});

export const contentInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'Title must be at least 3 characters')
      .max(100, 'Title must be 100 characters or fewer'),
    description: z.string().trim().max(2000, 'Description must be 2,000 characters or fewer'),
    priceCents: z
      .number({ invalid_type_error: 'Enter a valid price' })
      .int()
      .min(PRICE_MIN_CENTS, 'Minimum price is $0.99')
      .max(PRICE_MAX_CENTS, 'Maximum price is $999.99')
      .nullable(),
    thumbnailUrl: z
      .string()
      .regex(THUMBNAIL_URL_PATTERN, 'Thumbnail must be a generated cover path (/thumbs/...)')
      .nullable(),
    video: videoRefSchema.nullable(),
    /** The status the creator is asking for. The server decides whether it is allowed. */
    status: z.enum(['draft', 'scheduled', 'published']),
    scheduledFor: isoDateTime.nullable(),
    /** Explicit opt-in: "publish automatically once verification/processing finish". */
    publishWhenReady: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    // Drafts only need a title. Anything going live needs a complete record.
    if (v.status === 'draft') return;
    if (v.description.trim().length < 10) {
      ctx.addIssue({ code: 'custom', path: ['description'], message: 'Add a description of at least 10 characters to publish' });
    }
    if (v.priceCents == null) {
      ctx.addIssue({ code: 'custom', path: ['priceCents'], message: 'Set a price to publish' });
    }
    if (!v.thumbnailUrl) {
      ctx.addIssue({ code: 'custom', path: ['thumbnailUrl'], message: 'Add a thumbnail to publish' });
    }
    if (!v.video) {
      ctx.addIssue({ code: 'custom', path: ['video'], message: 'Upload a video to publish' });
    }
    if (v.status === 'scheduled' && !v.scheduledFor) {
      ctx.addIssue({ code: 'custom', path: ['scheduledFor'], message: 'Choose when to publish' });
    }
  });

export type ContentInput = z.infer<typeof contentInputSchema>;

/** Body of the dedicated POST /api/content/:id/publish endpoint. */
export const publishRequestSchema = z.object({
  scheduledFor: isoDateTime.nullable().optional(),
  publishWhenReady: z.boolean().optional(),
});
export type PublishRequest = z.infer<typeof publishRequestSchema>;

/** Time rule used by the server (injected clock) and the form (real clock). */
export function validateScheduleTime(iso: string | null | undefined, now: Date): string | null {
  if (!iso) return 'Choose when to publish';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'Enter a valid date and time';
  if (t < now.getTime() + MIN_SCHEDULE_LEAD_MS) return 'Pick a time at least 5 minutes from now';
  return null;
}

/* --------------------------------- uploads -------------------------------- */

export function fileExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

export const uploadInitSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive('File is empty').max(MAX_VIDEO_BYTES, 'Video must be 10 GB or smaller'),
  contentType: z.string().max(100),
}).superRefine((v, ctx) => {
  const ext = fileExtension(v.fileName);
  if (!(ALLOWED_VIDEO_EXTENSIONS as readonly string[]).includes(ext)) {
    ctx.addIssue({ code: 'custom', path: ['fileName'], message: 'Unsupported format. Use MP4, MOV, WebM or MKV' });
  }
  if (v.contentType !== '' && !v.contentType.startsWith('video/')) {
    ctx.addIssue({ code: 'custom', path: ['contentType'], message: 'That file is not a video' });
  }
});
export type UploadInit = z.infer<typeof uploadInitSchema>;

/* ------------------------------- auth / demo ------------------------------ */

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80, 'Name is too long'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(160),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const demoActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('switch-account'), account: z.enum(['maya', 'sam']) }),
  z.object({ action: z.literal('set-verification'), status: z.enum(['unverified', 'pending_review', 'verified', 'rejected']) }),
  z.object({ action: z.literal('review'), decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal('set-latency'), ms: z.union([z.literal(0), z.literal(800), z.literal(2500)]) }),
  z.object({ action: z.literal('set-api-errors'), enabled: z.boolean() }),
  z.object({ action: z.literal('fail-next-upload'), enabled: z.boolean() }),
  z.object({ action: z.literal('fail-next-processing'), enabled: z.boolean() }),
  z.object({ action: z.literal('run-jobs') }),
  z.object({ action: z.literal('load-empty') }),
  z.object({ action: z.literal('reset') }),
]);
export type DemoAction = z.infer<typeof demoActionSchema>;

/* ------------------------------ verification ------------------------------ */

export const DOCUMENT_TYPES = ['passport', 'drivers_license', 'national_id', 'residence_permit'] as const;

export const personalInfoSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Enter your full legal name')
    .max(100)
    .refine((v) => v.includes(' '), 'Enter first and last name as shown on your ID'),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date')
    .refine((v) => ageInYears(v, new Date()) >= 18, 'You must be at least 18 to sell content')
    .refine((v) => ageInYears(v, new Date()) <= 120, 'Enter a valid date'),
  country: z.string().refine(isCountryCode, 'Select your country'),
  addressLine: z.string().trim().min(5, 'Enter your street address').max(160),
  city: z.string().trim().min(2, 'Enter your city').max(80),
  postalCode: z.string().trim().min(3, 'Enter your postal code').max(12),
});
export type PersonalInfo = z.infer<typeof personalInfoSchema>;

export const documentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES, { errorMap: () => ({ message: 'Choose an ID type' }) }),
  fileName: z.string().min(1, 'Upload a photo or scan of your document').max(255),
  sizeBytes: z.number().int().positive().max(MAX_DOCUMENT_BYTES, 'File must be 10 MB or smaller'),
});

export const selfieSchema = z.object({
  method: z.enum(['camera', 'simulated']),
  completedAt: isoDateTime,
});

export const verificationSubmitSchema = z.object({
  personal: personalInfoSchema,
  document: documentSchema,
  selfie: selfieSchema,
});
export type VerificationSubmitInput = z.infer<typeof verificationSubmitSchema>;

export function ageInYears(dob: string, now: Date): number {
  const d = new Date(`${dob}T00:00:00Z`);
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

/* --------------------------------- queries -------------------------------- */

const num = (def: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).catch(def);

export const contentQuerySchema = z.object({
  q: z.string().trim().max(100).catch(''),
  status: z.enum(['all', 'published', 'draft', 'scheduled']).catch('all'),
  sort: z.enum(['created', 'title', 'price', 'views', 'purchases', 'revenue']).catch('created'),
  order: z.enum(['asc', 'desc']).catch('desc'),
  page: num(1, 1, 10_000),
  pageSize: num(8, 1, 50),
});
export type ContentQuery = z.infer<typeof contentQuerySchema>;

export const purchasesQuerySchema = z.object({
  q: z.string().trim().max(100).catch(''),
  /** Narrow to one content item. Still scoped to the signed-in creator on the server. */
  contentId: z.string().trim().max(64).catch(''),
  status: z.enum(['all', 'completed', 'pending', 'refunded', 'failed']).catch('all'),
  sort: z.enum(['date', 'amount']).catch('date'),
  order: z.enum(['asc', 'desc']).catch('desc'),
  page: num(1, 1, 10_000),
  pageSize: num(10, 1, 50),
});
export type PurchasesQuery = z.infer<typeof purchasesQuerySchema>;

export const overviewQuerySchema = z.object({
  range: z.coerce.number().refine((n) => [7, 30, 90].includes(n)).catch(30),
});

export function queryObject(params: URLSearchParams): Record<string, string> {
  return Object.fromEntries(params.entries());
}
