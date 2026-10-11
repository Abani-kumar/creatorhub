'use client';
import clsx from 'clsx';
import { Clapperboard, LayoutDashboard, ShieldCheck, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { VerificationStatus } from '@/lib/types';
import { BrandMark } from './brand';
import { SidebarVerificationCard } from './verification-card';

export const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/content/new', label: 'New content', icon: Clapperboard },
  { href: '/verification', label: 'Verification', icon: ShieldCheck },
];

export function isActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard' || (pathname.startsWith('/content') && !pathname.startsWith('/content/new'));
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ status }: { status: VerificationStatus }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-night px-4 pt-6 pb-5 lg:flex">
      <Link href="/dashboard" className="mb-8 flex items-center gap-3 px-2">
        <BrandMark />
        <span className="font-display text-xl font-semibold tracking-tight text-white">CreatorHub</span>
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'relative flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors',
                active ? 'bg-white/10 text-white' : 'text-night-text hover:bg-white/5 hover:text-white',
              )}
            >
              {active && <span className="absolute top-2 -left-4 h-7 w-[3px] rounded-r bg-accent" aria-hidden />}
              <Icon className="size-5" aria-hidden />
              {label}
              {href === '/verification' && status !== 'verified' && (
                <span className={clsx('ml-auto size-2 rounded-full', status === 'rejected' ? 'bg-[#ff8b9b]' : 'bg-[#ffc15e]')} aria-label="Action needed" />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto">
        <SidebarVerificationCard status={status} />
      </div>
    </aside>
  );
}
