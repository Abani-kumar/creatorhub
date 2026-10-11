import type { Metadata } from 'next';
import { VerificationPage } from '@/components/verification/verification-view';

export const metadata: Metadata = { title: 'Verify your identity' };

export default function Page() {
  return <VerificationPage />;
}
