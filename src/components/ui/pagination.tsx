import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';

export function Pagination({
  page, totalPages, total, pageSize, onPage, noun = 'items',
}: { page: number; totalPages: number; total: number; pageSize: number; onPage: (p: number) => void; noun?: string }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label={`${noun} pagination`} className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
      <p className="text-sm text-ink-3">
        <span className="hidden sm:inline">Showing </span>
        <span className="tabular-nums text-ink-2">{from}–{to}</span> of <span className="tabular-nums text-ink-2">{total}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <Button variant="secondary" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <span className="min-w-[5.5rem] text-center text-sm text-ink-2 tabular-nums" aria-live="polite">
          Page {page} of {totalPages}
        </span>
        <Button variant="secondary" size="icon" aria-label="Next page" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
