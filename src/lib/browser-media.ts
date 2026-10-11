/**
 * Browser-only helpers for the simulated video flow.
 * Thumbnails are generated covers (see thumbnail-ref.ts); video duration is read locally only.
 */
export { FRAME_PRESETS, newCoverSeed, thumbPath } from './thumbnail-ref';

/** Best-effort: not every container/codec exposes metadata in every browser, so null is a normal answer. */
export function readVideoDuration(file: File, timeoutMs = 4000): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}
