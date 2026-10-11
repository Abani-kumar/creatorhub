import clsx from 'clsx';
import { Film, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ContentView } from '@/lib/types';
import { formatDuration } from '@/lib/format';

/** 16:9 "film frame" with duration badge and a video-processing overlay. */
export function Thumb({ item, className }: { item: Pick<ContentView, 'title' | 'thumbnailUrl' | 'video'>; className?: string }) {
  const state = item.video?.state;
  return (
    <div className={clsx('relative aspect-video shrink-0 overflow-hidden rounded-lg bg-surface-2 ring-1 ring-black/5', className)}>
      {item.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URLs / generated SVG, nothing for next/image to optimise
        <img src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" width={320} height={180} className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center text-ink-3"><Film className="size-5" aria-hidden /></div>
      )}
      {item.video?.durationSec ? (
        <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] leading-none font-medium text-white tabular-nums">
          {formatDuration(item.video.durationSec)}
        </span>
      ) : null}
      {state === 'processing' && (
        <span className="absolute inset-0 grid place-items-center bg-night/70 text-white" title="Processing video">
          <span className="flex items-center gap-1.5 text-[11px] font-medium"><LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Processing</span>
        </span>
      )}
      {state === 'failed' && (
        <span className="absolute inset-0 grid place-items-center bg-bad/85 text-white" title="Video failed">
          <span className="flex items-center gap-1.5 text-[11px] font-medium"><TriangleAlert className="size-3.5" aria-hidden /> Failed</span>
        </span>
      )}
    </div>
  );
}
