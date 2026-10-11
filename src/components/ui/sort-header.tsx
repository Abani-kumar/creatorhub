'use client';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

/** A sortable <th>. Announces state to screen readers via aria-sort. */
export function SortHeader({
  label, active, order, onClick, align = 'left', className,
}: { label: string; active: boolean; order: 'asc' | 'desc'; onClick: () => void; align?: 'left' | 'right'; className?: string }) {
  const Icon = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'} className={clsx('px-4 py-2.5 font-medium', align === 'right' ? 'text-right' : 'text-left', className)}>
      <button
        type="button"
        onClick={onClick}
        className={clsx('-mx-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-surface-2 hover:text-ink', active ? 'text-ink' : 'text-ink-3')}
      >
        {label}
        <Icon className={clsx('size-3.5', !active && 'opacity-60')} aria-hidden />
      </button>
    </th>
  );
}
