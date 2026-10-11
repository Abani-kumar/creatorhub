'use client';
import clsx from 'clsx';
import { Film, RefreshCw, Shuffle } from 'lucide-react';
import { FRAME_PRESETS, newCoverSeed, thumbPath } from '@/lib/thumbnail-ref';
import { Button } from '@/components/ui/button';

/**
 * Generated SVG covers only — references are persisted as /thumbs/<seed>, not image bytes.
 */
export function ThumbnailPicker({
  value,
  onChange,
  error,
  contentId,
}: {
  value: string | null;
  onChange: (url: string) => void;
  error?: string;
  /** When set, "Use content cover" pins the thumbnail to /thumbs/{contentId}. */
  contentId?: string;
}) {
  const preview = value ?? (contentId ? thumbPath(contentId) : thumbPath(FRAME_PRESETS[0]));

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,15rem)_1fr]">
        <div className={clsx('relative aspect-video overflow-hidden rounded-lg bg-surface-2 ring-1', error ? 'ring-bad' : 'ring-black/10')}>
          {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG route */}
          <img src={preview} alt="Cover preview" className="size-full object-cover" />
        </div>

        <div className="flex flex-col justify-center gap-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => onChange(thumbPath(newCoverSeed()))}>
              <Shuffle className="size-4" aria-hidden /> New design
            </Button>
            {contentId && (
              <Button size="sm" variant="secondary" onClick={() => onChange(thumbPath(contentId))}>
                <RefreshCw className="size-4" aria-hidden /> Use content cover
              </Button>
            )}
          </div>
          <p className="text-xs text-ink-3">
            Covers are generated SVG artwork for this demo. The app stores a path like <code className="text-ink-2">/thumbs/…</code>, not image files.
          </p>

          <div role="radiogroup" aria-label="Pick a preset cover" className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-ink-3">Presets</span>
            {FRAME_PRESETS.map((seed) => {
              const url = thumbPath(seed);
              const selected = value === url;
              return (
                <button
                  key={seed}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`Preset ${seed.replace('frame-', '')}`}
                  onClick={() => onChange(url)}
                  className={clsx('aspect-video w-16 overflow-hidden rounded-md ring-2 transition', selected ? 'ring-accent' : 'ring-transparent hover:ring-line-strong')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG */}
                  <img src={url} alt="" className="size-full object-cover" />
                </button>
              );
            })}
          </div>
          {!value && (
            <p className="flex items-center gap-1.5 text-xs text-ink-3">
              <Film className="size-3.5" aria-hidden /> A default cover is assigned when you save.
            </p>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}
