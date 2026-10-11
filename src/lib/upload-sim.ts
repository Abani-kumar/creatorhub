/**
 * Simulated upload: a pure state machine.
 *
 * NOTHING IS TRANSMITTED. The browser keeps the selected File; the server only records metadata
 * (name, size, type, timestamps, status). The "transfer" is a timer that advances a progress value,
 * so the UI can demonstrate progress, pause/resume, an injected interruption with resume-from-last-part,
 * completion, processing and failure without any media infrastructure.
 *
 * Keeping this as a reducer (no timers, no fetch) makes the behaviour unit-testable. The component owns
 * the side effects (interval, API calls) and feeds events in.
 *
 * Production shape (see docs/ARCHITECTURE.md): init -> presigned multipart part URLs -> parallel part PUTs
 * straight to object storage -> complete -> background transcoding. The phases below map 1:1 onto that.
 */
import { uploadInitSchema } from './schemas';

export type UploadPhase =
  | 'idle'
  | 'starting' //     asking the server to open the (simulated) multipart upload
  | 'uploading' //    progress advancing
  | 'paused' //       user paused; parts already sent are kept
  | 'interrupted' //  injected connection drop; retry resumes from the last completed part
  | 'finishing' //    all parts sent, asking the server to complete the upload
  | 'processing' //   server-side processing (a timer in the demo, a transcoding worker in production)
  | 'ready'
  | 'failed' //      processing failed on the server: the creator must upload again
  | 'error'; //      a request failed (init/complete): can be retried

export interface PickedFile {
  name: string;
  sizeBytes: number;
  contentType: string;
}

export interface SimState {
  phase: UploadPhase;
  file: PickedFile | null;
  uploadId: string | null;
  partCount: number;
  /** Parts fully committed. Only whole parts survive an interruption. */
  partsDone: number;
  /** 0..100, may sit between part boundaries while uploading. */
  progress: number;
  /** Progress (%) at which the injected interruption fires; null when none is pending. */
  interruptAt: number | null;
  message: string | null;
}

/** ~6 seconds end to end regardless of file size: this is a demonstration, not a bandwidth test. */
export const TICK_MS = 250;
export const TICKS_TO_COMPLETE = 24;
export const INTERRUPT_AT_PERCENT = 55;

export const initialSim: SimState = {
  phase: 'idle',
  file: null,
  uploadId: null,
  partCount: 0,
  partsDone: 0,
  progress: 0,
  interruptAt: null,
  message: null,
};

export type SimEvent =
  | { type: 'select'; file: PickedFile }
  | { type: 'started'; uploadId: string; partCount: number; simulateInterruption: boolean }
  | { type: 'tick' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'retry' }
  | { type: 'completed' }
  | { type: 'server-state'; state: 'processing' | 'ready' | 'failed' }
  | { type: 'request-failed'; message: string }
  | { type: 'reset' };

const clampParts = (n: number) => Math.max(1, n);

export function simReducer(s: SimState, e: SimEvent): SimState {
  switch (e.type) {
    case 'select':
      return { ...initialSim, phase: 'starting', file: e.file };

    case 'started':
      // A late response (user cancelled or picked another file meanwhile) must not resurrect an upload.
      if (s.phase !== 'starting') return s;
      return {
        ...s,
        phase: 'uploading',
        uploadId: e.uploadId,
        partCount: clampParts(e.partCount),
        partsDone: 0,
        progress: 0,
        interruptAt: e.simulateInterruption ? INTERRUPT_AT_PERCENT : null,
        message: null,
      };

    case 'tick': {
      if (s.phase !== 'uploading') return s;
      const progress = Math.min(100, s.progress + 100 / TICKS_TO_COMPLETE);
      const partsDone = Math.min(s.partCount, Math.floor((progress / 100) * s.partCount));

      if (s.interruptAt !== null && progress >= s.interruptAt) {
        // The connection drops mid-part: only whole parts that were acknowledged are kept.
        return {
          ...s,
          phase: 'interrupted',
          partsDone,
          progress: (partsDone / s.partCount) * 100,
          interruptAt: null, // one-shot: the retry must not drop again
          message: `Connection lost. ${partsDone} of ${s.partCount} parts are safely uploaded, so retrying resumes from part ${partsDone + 1}.`,
        };
      }
      if (progress >= 100) return { ...s, phase: 'finishing', progress: 100, partsDone: s.partCount };
      return { ...s, progress, partsDone };
    }

    case 'pause':
      return s.phase === 'uploading' ? { ...s, phase: 'paused' } : s;

    case 'resume':
      return s.phase === 'paused' ? { ...s, phase: 'uploading' } : s;

    case 'retry':
      if (s.phase === 'interrupted') return { ...s, phase: 'uploading', message: null };
      if (s.phase === 'error') {
        // Never reached the server: start over. Reached it (finishing/complete call failed): all parts are sent, re-complete.
        return s.uploadId ? { ...s, phase: 'finishing', message: null } : { ...s, phase: 'starting', message: null };
      }
      return s;

    case 'completed':
      return s.phase === 'finishing' ? { ...s, phase: 'processing', message: null } : s;

    case 'server-state':
      if (s.phase !== 'processing') return s;
      if (e.state === 'ready') return { ...s, phase: 'ready' };
      if (e.state === 'failed') {
        return { ...s, phase: 'failed', message: 'Processing failed on our side. Your file is fine; upload it again to retry.' };
      }
      return s;

    case 'request-failed':
      return { ...s, phase: 'error', message: e.message };

    case 'reset':
      return initialSim;
  }
}

/** True while a transfer is in progress or recoverable: the form must not save a half-finished upload. */
export function isTransferActive(phase: UploadPhase): boolean {
  return phase === 'starting' || phase === 'uploading' || phase === 'paused' || phase === 'interrupted' || phase === 'finishing' || phase === 'error';
}

/** Client-side check for fast feedback. The server runs the same schema and is the authority. */
export function validateVideoFile(file: PickedFile): string | null {
  const parsed = uploadInitSchema.safeParse({ fileName: file.name, sizeBytes: file.sizeBytes, contentType: file.contentType });
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? 'This file cannot be uploaded';
}
