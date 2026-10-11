'use client';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { mutate } from 'swr';
import { api } from '@/lib/api-client';
import type { CreatorView } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { VerificationBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

export function AccountSheet({ open, onClose, creator }: { open: boolean; onClose: () => void; creator: CreatorView }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await api.post('/api/auth/logout');
      await mutate(() => true, undefined, { revalidate: false });
      router.replace('/sign-in');
    } catch {
      toast.error("Couldn't sign out. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Account" dismissible={!busy}>
      <div className="flex items-center gap-4">
        <span className="grid size-14 place-items-center rounded-full bg-night font-display text-xl font-semibold text-white">{creator.name.charAt(0).toUpperCase()}</span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{creator.name}</p>
          <p className="truncate text-sm text-ink-3">{creator.email}</p>
          <div className="mt-1.5"><VerificationBadge status={creator.verification.status} /></div>
        </div>
      </div>
      <Button variant="secondary" className="mt-6 w-full" onClick={signOut} loading={busy}>
        <LogOut className="size-4" aria-hidden /> Sign out
      </Button>
    </Dialog>
  );
}
