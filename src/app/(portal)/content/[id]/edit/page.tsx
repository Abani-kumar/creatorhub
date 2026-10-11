'use client';
import { Film } from 'lucide-react';
import { useParams } from 'next/navigation';
import { ContentForm } from '@/components/content/content-form';
import { LinkButton } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { ApiClientError } from '@/lib/api-client';
import { useContent } from '@/lib/hooks';

export default function EditContentPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading, isValidating, mutate } = useContent(id);

  if (error && !data) {
    const notFound = error instanceof ApiClientError && error.status === 404;
    return (
      <div className="rounded-card bg-surface shadow-card ring-1 ring-line">
        {notFound ? (
          <EmptyState icon={<Film className="size-5" aria-hidden />} title="Content not found" body="It may have been deleted, or the link is wrong." action={<LinkButton href="/dashboard">Back to dashboard</LinkButton>} />
        ) : (
          <ErrorState network={error instanceof ApiClientError && error.isNetwork} message={error.message} onRetry={() => mutate()} retrying={isValidating} />
        )}
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div role="status" aria-label="Loading content" className="space-y-5">
        <Skeleton className="h-9 w-56" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21.5rem]"><Skeleton className="h-96 rounded-card" /><Skeleton className="h-72 rounded-card" /></div>
      </div>
    );
  }
  // `key` makes the form start fresh if the creator navigates from one item's editor to another's.
  return <ContentForm key={data.id} item={data} />;
}
