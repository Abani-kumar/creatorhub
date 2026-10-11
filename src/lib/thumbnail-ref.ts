/**
 * Thumbnail references stored in JSON — always `/thumbs/<seed>` paths served by the App Router.
 * No image bytes or data URLs are persisted.
 */

/** Preset cover seeds (deterministic SVG artwork via thumbnailSvg). */
export const FRAME_PRESETS = ['frame-aurora', 'frame-dusk', 'frame-reef', 'frame-ember'] as const;

export const THUMBNAIL_URL_PATTERN = /^\/thumbs\/[A-Za-z0-9_-]{1,64}$/;

export function thumbPath(seed: string): string {
  return `/thumbs/${seed}`;
}

export function defaultContentThumbnail(contentId: string): string {
  return thumbPath(contentId);
}

export function isThumbnailPath(url: string | null | undefined): url is string {
  return typeof url === 'string' && THUMBNAIL_URL_PATTERN.test(url);
}

/** Stable path for a newly generated cover design (client-side pick before save). */
export function newCoverSeed(): string {
  return `cover-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeThumbnailUrl(input: string | null | undefined, contentId: string): string {
  if (isThumbnailPath(input)) return input;
  return defaultContentThumbnail(contentId);
}
