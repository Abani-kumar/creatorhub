'use client';
import { useParams } from 'next/navigation';
import { ContentDetails } from '@/components/content/content-details';

export default function ContentDetailsPage() {
  const params = useParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <ContentDetails id={id} />;
}
