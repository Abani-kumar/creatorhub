'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiClientError } from '@/lib/api-client';
import { useMe } from '@/lib/hooks';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { AccountSheet } from './account-sheet';
import { BottomNav } from './bottom-nav';
import { BrandMark } from './brand';
import { DemoButton, DemoPanel } from './demo-panel';
import { Sidebar } from './sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data, error, isLoading, mutate } = useMe();
  const router = useRouter();
  const [demoOpen, setDemoOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const unauthenticated = error instanceof ApiClientError && error.status === 401;
  useEffect(() => {
    if (unauthenticated) router.replace('/sign-in');
  }, [unauthenticated, router]);

  if (error && !unauthenticated) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <ErrorState network={error instanceof ApiClientError && error.isNetwork} message={error.message} onRetry={() => mutate()} />
      </main>
    );
  }
  if (!data) return <ShellSkeleton label={isLoading ? 'Loading your workspace' : 'Redirecting to sign in'} />;

  const { creator, demoMode } = data;
  const status = creator.verification.status;

  return (
    <div className="min-h-dvh lg:pl-64">
      <Sidebar status={status} />
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-canvas/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-6 lg:px-10">
        <div className="flex items-center gap-2.5 lg:hidden">
          <BrandMark className="size-8" />
          <span className="font-display text-lg font-semibold">CreatorHub</span>
        </div>
        <p className="hidden text-sm text-ink-3 lg:block">Creator Portal</p>
        <div className="flex items-center gap-2">
          {demoMode && <DemoButton onClick={() => setDemoOpen(true)} />}
          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            aria-label={`Account: ${creator.name}`}
            className="flex h-10 items-center gap-2.5 rounded-full bg-surface pr-1.5 pl-1.5 ring-1 ring-line hover:ring-line-strong sm:pr-3.5"
          >
            <span className="grid size-7 place-items-center rounded-full bg-night text-xs font-semibold text-white">{creator.name.charAt(0).toUpperCase()}</span>
            <span className="hidden text-sm font-medium sm:block">{creator.name}</span>
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1180px] px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pb-16">{children}</main>
      <BottomNav needsVerification={status !== 'verified'} />
      {demoMode && <DemoPanel open={demoOpen} onClose={() => setDemoOpen(false)} />}
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} creator={creator} />
    </div>
  );
}

function ShellSkeleton({ label }: { label: string }) {
  return (
    <div className="min-h-dvh lg:pl-64" role="status" aria-label={label}>
      <div className="fixed inset-y-0 left-0 hidden w-64 bg-night lg:block" />
      <div className="h-14 border-b border-line" />
      <div className="mx-auto max-w-[1180px] space-y-4 px-4 pt-6 sm:px-6 lg:px-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    </div>
  );
}
