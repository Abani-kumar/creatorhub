import { LinkButton } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="font-display text-6xl font-semibold text-ink">404</p>
        <h1 className="mt-2 text-xl font-semibold">This page isn&apos;t in the timeline</h1>
        <p className="mt-1 text-sm text-ink-3">The link may be broken, or the content was removed.</p>
        <LinkButton href="/dashboard" className="mt-6">Back to dashboard</LinkButton>
      </div>
    </main>
  );
}
