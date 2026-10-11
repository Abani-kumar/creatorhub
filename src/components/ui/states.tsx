import { CircleAlert, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center animate-fade-in">
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-surface-2 text-ink-3 ring-1 ring-line">{icon}</div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-3">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message, onRetry, retrying, network, compact,
}: { message?: string; onRetry?: () => void; retrying?: boolean; network?: boolean; compact?: boolean }) {
  return (
    <div role="alert" className={`flex flex-col items-center px-6 text-center animate-fade-in ${compact ? 'py-8' : 'py-12'}`}>
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-bad-soft text-bad">
        {network ? <WifiOff className="size-5" aria-hidden /> : <CircleAlert className="size-5" aria-hidden />}
      </div>
      <h3 className="text-base font-semibold text-ink">{network ? "Can't reach the server" : "We couldn't load this"}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-3">{message ?? 'Something went wrong. Please try again.'}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      )}
    </div>
  );
}
