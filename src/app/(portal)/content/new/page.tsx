import type { Metadata } from 'next';
import { ContentForm } from '@/components/content/content-form';

export const metadata: Metadata = { title: 'New content' };

export default function NewContentPage() {
  return <ContentForm />;
}
