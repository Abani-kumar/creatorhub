'use client';
import { Plus } from 'lucide-react';
import { ContentSection } from '@/components/dashboard/content-section';
import { PerformanceChart } from '@/components/dashboard/performance-chart';
import { PurchasesSection } from '@/components/dashboard/purchases-section';
import { StatsStrip } from '@/components/dashboard/stats-strip';
import { VerificationBanner } from '@/components/dashboard/verification-banner';
import { LinkButton } from '@/components/ui/button';
import { useMe } from '@/lib/hooks';

export default function DashboardPage() {
  const { data } = useMe();
  const first = data?.creator.name.split(' ')[0];
  return (
    <>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.65rem] leading-tight font-semibold sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-3">{first ? `Welcome back, ${first}. Here's how your content is doing.` : 'Here is how your content is doing.'}</p>
        </div>
        <LinkButton href="/content/new" className="max-sm:hidden">
          <Plus className="size-4" aria-hidden /> New content
        </LinkButton>
      </div>
      {data && <VerificationBanner creator={data.creator} />}
      <StatsStrip />
      <PerformanceChart />
      <ContentSection />
      <PurchasesSection />
    </>
  );
}
