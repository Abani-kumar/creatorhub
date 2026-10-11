'use client';
import { ErrorState } from '@/components/ui/states';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center">
      <ErrorState message="An unexpected error occurred while rendering this page." onRetry={reset} />
    </main>
  );
}
