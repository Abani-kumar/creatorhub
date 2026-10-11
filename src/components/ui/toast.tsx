'use client';
import clsx from 'clsx';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import Link from 'next/link';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Kind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: Kind; message: string; action?: { label: string; href: string } }
interface Api {
  success: (message: string, opts?: { action?: ToastItem['action'] }) => void;
  error: (message: string, opts?: { action?: ToastItem['action'] }) => void;
  info: (message: string, opts?: { action?: ToastItem['action'] }) => void;
}

const Ctx = createContext<Api | null>(null);

export function useToast(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}

const ICON = { success: CircleCheck, error: CircleAlert, info: Info } as const;
const TONE: Record<Kind, string> = { success: 'text-[#5be0b2]', error: 'text-[#ff8b9b]', info: 'text-[#9fb0ff]' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((kind: Kind, message: string, opts?: { action?: ToastItem['action'] }) => {
    const id = nextId.current++;
    setItems((l) => [...l.slice(-2), { id, kind, message, action: opts?.action }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 5000);
  }, [dismiss]);

  const api = useMemo<Api>(() => ({
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    info: (m, o) => push('info', m, o),
  }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {items.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <div key={t.id} className="pointer-events-auto flex w-full max-w-md animate-rise items-start gap-3 rounded-xl bg-night px-4 py-3 text-sm text-white shadow-pop">
              <Icon className={clsx('mt-0.5 size-5 shrink-0', TONE[t.kind])} aria-hidden />
              <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
              {t.action && (
                <Link href={t.action.href} className="shrink-0 rounded-md px-2 py-1 font-medium text-white underline underline-offset-4 hover:bg-white/10">
                  {t.action.label}
                </Link>
              )}
              <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="-mr-1 grid size-7 shrink-0 place-items-center rounded-md text-night-text hover:bg-white/10 hover:text-white">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
