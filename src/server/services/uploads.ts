import type { UploadInit } from '@/lib/schemas';
import type { Database, Upload, UploadInitResponse, UploadView } from '@/lib/types';
import { ApiError, notFound } from '../errors';
import { effectiveUploadState } from '../domain/publishing';
import { newId } from './shared';

const MB = 1024 * 1024;

/** Part size a real multipart upload would use: small parts on small files, larger on huge ones (S3 caps at 10,000 parts). */
function partSizeFor(sizeBytes: number): number {
  if (sizeBytes <= 100 * MB) return 5 * MB;
  if (sizeBytes <= 2048 * MB) return 16 * MB;
  return 64 * MB;
}

function getOwnedUpload(db: Readonly<Database>, creatorId: string, id: string): Upload {
  const upload = db.uploads.find((u) => u.id === id && u.creatorId === creatorId);
  if (!upload) throw notFound('Upload');
  return upload;
}

const toView = (u: Upload, now: Date): UploadView => ({
  id: u.id,
  fileName: u.fileName,
  sizeBytes: u.sizeBytes,
  state: effectiveUploadState(u, now) ?? 'failed',
});

/**
 * Production: create an S3 multipart upload and return presigned part URLs. The file never touches our servers.
 * Demo: only metadata is recorded; the browser *simulates* the transfer. Nothing is transmitted or stored.
 */
export function initUpload(db: Database, creatorId: string, input: UploadInit, now: Date): UploadInitResponse {
  const partSizeBytes = partSizeFor(input.sizeBytes);
  const upload: Upload = {
    id: newId('upl'), creatorId, fileName: input.fileName, sizeBytes: input.sizeBytes, contentType: input.contentType,
    status: 'initiated', createdAt: now.toISOString(), uploadedAt: null, processingFails: false,
  };
  db.uploads.push(upload);
  const simulateInterruption = db.demo.failNextUpload;
  db.demo.failNextUpload = false; // one-shot
  return {
    uploadId: upload.id,
    partSizeBytes,
    partCount: Math.ceil(input.sizeBytes / partSizeBytes),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    simulated: true,
    simulateInterruption,
  };
}

export function completeUpload(db: Database, creatorId: string, id: string, now: Date): UploadView {
  const upload = getOwnedUpload(db, creatorId, id);
  if (upload.status === 'failed') throw new ApiError(409, 'UPLOAD_FAILED', 'This upload was aborted. Start a new upload.');
  if (upload.status === 'initiated') {
    upload.status = 'uploaded';
    upload.uploadedAt = now.toISOString();
    upload.processingFails = db.demo.failNextProcessing;
    db.demo.failNextProcessing = false; // one-shot
  }
  return toView(upload, now);
}

export function abortUpload(db: Database, creatorId: string, id: string, now: Date): UploadView {
  const upload = getOwnedUpload(db, creatorId, id);
  if (upload.status === 'initiated') upload.status = 'failed';
  return toView(upload, now);
}

export function getUploadView(db: Readonly<Database>, creatorId: string, id: string, now: Date): UploadView {
  return toView(getOwnedUpload(db, creatorId, id), now);
}
