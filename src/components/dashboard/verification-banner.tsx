'use client';
import { Hourglass, ShieldAlert } from 'lucide-react';
import type { CreatorView } from '@/lib/types';
import { LinkButton } from '@/components/ui/button';

/** Dashboard-level nudge. Hidden once verified. Not a wall: creators can keep making drafts. */
export function VerificationBanner({ creator }: { creator: CreatorView }) {
  const v = creator.verification;
  if (v.status === 'verified') return null;

  const cfg = {
    unverified: { tone: 'border-[#f0d7a1] bg-warn-soft', icon: ShieldAlert, iconTone: 'text-warn', title: 'Verify your identity to start publishing', body: "You can upload and save drafts right now. Publishing and scheduling unlock after a quick four-step check (about 3 minutes).", cta: 'Verify identity' },
    pending_review: { tone: 'border-[#c9d0ff] bg-info-soft', icon: Hourglass, iconTone: 'text-info', title: 'Your verification is in review', body: "We're checking your details. You'll be able to publish as soon as it's approved. Anything you marked \"publish when approved\" will go live automatically.", cta: 'View status' },
    rejected: { tone: 'border-[#f3c3ca] bg-bad-soft', icon: ShieldAlert, iconTone: 'text-bad', title: "Your verification wasn't approved", body: v.rejectionReason ?? 'Please check your details and resubmit.', cta: 'Resubmit' },
  }[v.status];
  const Icon = cfg.icon;

  return (
    <section aria-label="Verification status" className={`mb-5 flex flex-col gap-4 rounded-card border p-4 sm:flex-row sm:items-center sm:p-5 ${cfg.tone}`}>
      <Icon className={`size-6 shrink-0 ${cfg.iconTone}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <h2 className="font-sans text-[15px] font-semibold text-ink">{cfg.title}</h2>
        <p className="mt-0.5 text-sm text-ink-2">{cfg.body}</p>
      </div>
      <LinkButton href="/verification" className="w-full sm:w-auto">{cfg.cta}</LinkButton>
    </section>
  );
}
