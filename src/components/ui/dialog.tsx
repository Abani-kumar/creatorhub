'use client';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Accessible modal built on the native <dialog>: focus trap, Esc to close, inert background and
 * focus restore come from the platform. On phones it becomes a bottom sheet; "panel" is a side drawer on desktop.
 */
export function Dialog({
  open, onClose, title, description, children, variant = 'center', dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  variant?: 'center' | 'panel';
  /** false while a request is in flight, so the user can't dismiss mid-action. */
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const shape =
    variant === 'panel'
      ? 'm-0 mt-auto w-full rounded-t-2xl sm:mt-0 sm:ml-auto sm:h-dvh sm:w-[27rem] sm:rounded-none sm:rounded-l-2xl'
      : 'm-0 mt-auto w-full rounded-t-2xl sm:m-auto sm:w-[min(92vw,30rem)] sm:rounded-2xl';

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
      className={clsx('animate-rise bg-surface text-ink shadow-pop max-h-[92dvh] overflow-y-auto sm:max-h-[92dvh]', variant === 'panel' && 'sm:max-h-dvh', shape)}
    >
      {open && (
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
              {description && <p id={descId} className="mt-1 text-sm text-ink-3">{description}</p>}
            </div>
            {dismissible && (
              <button type="button" onClick={onClose} aria-label="Close" className="-mt-1 -mr-2 grid size-10 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink">
                <X className="size-5" aria-hidden />
              </button>
            )}
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
