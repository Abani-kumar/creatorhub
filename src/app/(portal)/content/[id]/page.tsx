'use client';
import { useParams } from 'next/navigation';
import { ContentDetails } from '@/components/content/content-details';

export default function ContentDetailsPage() {
  const { id } = useParams<{ id: string }>();
  return <ContentDetails id={id} />;
}
