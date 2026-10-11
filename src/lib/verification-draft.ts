/**
 * Verification wizard draft: what makes "progress survives a page refresh" true.
 *
 * The draft lives in the browser (localStorage, one key per creator) because it is in-progress form state,
 * not a business record. Only the final submission is sent to the server. Everything here is pure so it can
 * be unit-tested; the component is the only code that touches `localStorage`.
 *
 * Simulation note: the identity document is never uploaded or stored. The draft keeps only its file name and
 * size, exactly like the server record does.
 */
import type { DocumentType } from './types';
import { documentSchema, personalInfoSchema, type PersonalInfo, type VerificationSubmitInput } from './schemas';

export const WIZARD_STEPS = [
  { key: 'personal', label: 'Your details' },
  { key: 'document', label: 'ID document' },
  { key: 'selfie', label: 'Identity check' },
  { key: 'review', label: 'Review & submit' },
] as const;
export type WizardStep = 0 | 1 | 2 | 3;

export interface DraftDocument {
  type?: DocumentType;
  fileName?: string;
  sizeBytes?: number;
}

export interface DraftSelfie {
  method: 'simulated' | 'camera';
  completedAt: string;
}

export interface WizardDraft {
  version: 1;
  step: WizardStep;
  personal: Partial<PersonalInfo>;
  document: DraftDocument;
  selfie: DraftSelfie | null;
}

export const emptyDraft = (): WizardDraft => ({ version: 1, step: 0, personal: {}, document: {}, selfie: null });

export const draftKey = (creatorId: string) => `creatorhub:verification-draft:v1:${creatorId}`;

const isStep = (n: unknown): n is WizardStep => n === 0 || n === 1 || n === 2 || n === 3;

/** Tolerant: anything missing, malformed or from another version yields a clean empty draft. Never throws. */
export function parseDraft(raw: string | null): WizardDraft {
  if (!raw) return emptyDraft();
  try {
    const v = JSON.parse(raw) as Partial<WizardDraft> | null;
    if (!v || typeof v !== 'object' || v.version !== 1) return emptyDraft();
    const selfie =
      v.selfie && typeof v.selfie === 'object' && typeof v.selfie.completedAt === 'string' && (v.selfie.method === 'simulated' || v.selfie.method === 'camera')
        ? { method: v.selfie.method, completedAt: v.selfie.completedAt }
        : null;
    return {
      version: 1,
      step: isStep(v.step) ? v.step : 0,
      personal: v.personal && typeof v.personal === 'object' ? (v.personal as Partial<PersonalInfo>) : {},
      document: v.document && typeof v.document === 'object' ? (v.document as DraftDocument) : {},
      selfie,
    };
  } catch {
    return emptyDraft();
  }
}

export const serializeDraft = (d: WizardDraft): string => JSON.stringify(d);

export const personalIsValid = (d: WizardDraft) => personalInfoSchema.safeParse(d.personal).success;
export const documentIsValid = (d: WizardDraft) => documentSchema.safeParse({ type: d.document.type, fileName: d.document.fileName ?? '', sizeBytes: d.document.sizeBytes ?? 0 }).success;
export const selfieIsDone = (d: WizardDraft) => d.selfie !== null;

/**
 * The furthest step the creator may be on given what is actually filled in.
 * Stops a refreshed/edited draft (or a stale step number) from landing on "Review" with missing data.
 */
export function furthestReachableStep(d: WizardDraft): WizardStep {
  if (!personalIsValid(d)) return 0;
  if (!documentIsValid(d)) return 1;
  if (!selfieIsDone(d)) return 2;
  return 3;
}

export function clampStep(d: WizardDraft): WizardDraft {
  const max = furthestReachableStep(d);
  return d.step > max ? { ...d, step: max } : d;
}

/** Which step owns a server validation path like "personal.dateOfBirth" or "document.sizeBytes". */
export function stepForFieldPath(path: string): WizardStep {
  if (path.startsWith('document')) return 1;
  if (path.startsWith('selfie')) return 2;
  return 0;
}

/** Earliest step that has a server-reported error, so the creator lands where they can fix it. */
export function firstStepWithError(fields: Record<string, string>): WizardStep | null {
  const steps = Object.keys(fields).map(stepForFieldPath);
  return steps.length ? (Math.min(...steps) as WizardStep) : null;
}

/** Build the exact body for POST /api/verification, or null if the draft is not complete. */
export function toSubmission(d: WizardDraft): VerificationSubmitInput | null {
  if (!personalIsValid(d) || !documentIsValid(d) || !d.selfie) return null;
  return {
    personal: d.personal as PersonalInfo,
    document: { type: d.document.type!, fileName: d.document.fileName!, sizeBytes: d.document.sizeBytes! },
    selfie: { method: d.selfie.method, completedAt: d.selfie.completedAt },
  };
}

/**
 * After a rejection the creator starts again. Personal details are kept (typos aside they are usually right);
 * the document and identity check are cleared because those are what a reviewer rejects.
 */
export function startResubmission(d: WizardDraft): WizardDraft {
  return { version: 1, step: 0, personal: d.personal, document: {}, selfie: null };
}
