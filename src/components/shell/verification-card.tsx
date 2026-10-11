'use client';
import { BadgeCheck, Hourglass, ShieldAlert, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { VerificationStatus } from '@/lib/types';

const COPY: Record<VerificationStatus, { title: string; body: string; cta: string | null; icon: typeof ShieldCheck }> = {
  unverified: { title: 'Identity not verified', body: 'You can create drafts. Publishing unlocks after verification.', cta: 'Verify identity', icon: ShieldAlert },
  pending_review: { title: 'Verification in review', body: "We're checking your details. You'll be able to publish once approved.", cta: 'View status', icon: Hourglass },
  rejected: { title: 'Verification not approved', body: 'Resubmit your details to unlock publishing.', cta: 'Resubmit', icon: ShieldAlert },
  verified: { title: 'Identity verified', body: 'You can publish and schedule content.', cta: null, icon: BadgeCheck },
};

/** Compact status card for the dark sidebar. */
export function SidebarVerificationCard({ status }: { status: VerificationStatus }) {
  const c = COPY[status];
  const Icon = c.icon;
  const good = status === 'verified';
  return (
    <div className="rounded-xl bg-night-2 p-4 text-sm">
      <div className="flex items-center gap-2.5">
        <Icon className={good ? 'size-5 text-[#5be0b2]' : 'size-5 text-[#ffc15e]'} aria-hidden />
        <p className="font-medium text-white">{c.title}</p>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-night-text">{c.body}</p>
      {c.cta && (
        <Link href="/verification" className="mt-3 inline-flex h-9 items-center rounded-lg bg-white/10 px-3 text-[13px] font-medium text-white hover:bg-white/15">
          {c.cta}
        </Link>
      )}
    </div>
  );
}
