'use client';
import clsx from 'clsx';

export interface SegOption<T extends string | number> {
  value: T;
  label: string;
  count?: number;
}

/** Radio-group semantics, tap-friendly. Horizontally scrollable if it ever overflows on narrow screens. */
export function Segmented<T extends string | number>({
  options, value, onChange, label, className,
}: { options: SegOption<T>[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={clsx('inline-flex max-w-full gap-0.5 overflow-x-auto rounded-control bg-surface-2 p-0.5 ring-1 ring-inset ring-line', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'inline-flex h-9 items-center gap-1.5 rounded-[8px] px-2 text-sm sm:px-3 font-medium whitespace-nowrap transition-colors sm:h-8',
              active ? 'bg-surface text-ink shadow-card ring-1 ring-line' : 'text-ink-3 hover:text-ink',
            )}
          >
            {o.label}
            {o.count !== undefined && <span className={clsx('text-xs tabular-nums', active ? 'text-ink-3' : 'text-ink-3/80')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
