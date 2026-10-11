/** Shared limits and tunables. Imported by both the browser and the server. */

export const MAX_VIDEO_BYTES = 10 * 1024 ** 3; // 10 GB
export const ALLOWED_VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv'] as const;
export const MAX_THUMBNAIL_DATA_URL_CHARS = 700_000;
export const MAX_DOCUMENT_BYTES = 10 * 1024 ** 2; // 10 MB

export const PRICE_MIN_CENTS = 99;
export const PRICE_MAX_CENTS = 99_999;

/** A scheduled publication must be at least this far in the future. */
export const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;

/** Simulated processing time after an upload completes (stand-in for a transcoding pipeline). */
export const PROCESSING_MS = 6_000;

export const SESSION_COOKIE = 'ch_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DB_VERSION = 1;
