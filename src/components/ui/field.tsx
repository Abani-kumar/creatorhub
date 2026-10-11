'use client';
import clsx from 'clsx';
import { Search, X } from 'lucide-react';
import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react';

export const inputClass =
  'block w-full rounded-control border border-line-strong bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3/80 transition-colors hover:border-ink-3/60 focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:bg-surface-2 disabled:text-ink-3 aria-[invalid=true]:border-bad aria-[invalid=true]:focus-visible:ring-bad/30 h-11 sm:h-10 sm:text-sm';

export function SearchInput({
  value, onChange, placeholder, label,
}: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={clsx(inputClass, 'pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function SelectInput({ className, label, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return <select aria-label={label} className={clsx(inputClass, 'pr-8', className)} {...rest} />;
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(inputClass, className)} {...rest} />;
}
