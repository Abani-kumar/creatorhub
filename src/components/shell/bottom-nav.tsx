'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActive, NAV } from './sidebar';

/** Thumb-reach navigation for phones and small tablets. */
export function BottomNav({ needsVerification }: { needsVerification: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          const isNew = href === '/content/new';
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? 'page' : undefined} className="flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium">
                <span className={clsx('relative grid h-8 w-12 place-items-center rounded-full transition-colors', isNew ? 'bg-ink text-white' : active ? 'bg-accent-soft text-accent' : 'text-ink-3')}>
                  <Icon className="size-5" aria-hidden />
                  {href === '/verification' && needsVerification && <span className="absolute top-0.5 right-2.5 size-2 rounded-full bg-accent ring-2 ring-surface" aria-label="Action needed" />}
                </span>
                <span className={active ? 'text-ink' : 'text-ink-3'}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
