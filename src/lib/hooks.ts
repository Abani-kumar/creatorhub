'use client';
import { useEffect, useState } from 'react';
import useSWR, { mutate } from 'swr';
import { api } from './api-client';
import type { ContentView, MeResponse, OverviewResponse, Paginated, PurchaseView, UploadView, VerificationView } from './types';

export const fetcher = <T,>(url: string) => api.get<T>(url);

export function useMe() {
  return useSWR<MeResponse>('/api/me', fetcher, { shouldRetryOnError: false, revalidateOnFocus: true });
}

export function useOverview(range: 7 | 30 | 90) {
  return useSWR<OverviewResponse>(`/api/overview?range=${range}`, fetcher, { keepPreviousData: true });
}

export function useContentList(qs: string) {
  return useSWR<Paginated<ContentView>>(`/api/content?${qs}`, fetcher, { keepPreviousData: true });
}

/** Pass `null` to skip fetching (e.g. nothing to show yet). */
export function usePurchases(qs: string | null) {
  return useSWR<Paginated<PurchaseView>>(qs === null ? null : `/api/purchases?${qs}`, fetcher, { keepPreviousData: true });
}

/** Revalidate every cached API response (after any mutation / demo action). */
export function refreshAll() {
  return mutate((key) => typeof key === 'string' && key.startsWith('/api/'));
}

/** After switching account: drop everything cached for the previous creator, then refetch. */
export function resetAll() {
  return mutate((key) => typeof key === 'string' && key.startsWith('/api/'), undefined, { revalidate: true });
}

export function buildQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== 'all') sp.set(k, String(v));
  return sp.toString();
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** One content item. Polls while something is still changing (processing, or waiting on a publish intent). */
export function useContent(id: string | undefined) {
  return useSWR<ContentView>(id ? `/api/content/${id}` : null, fetcher, {
    refreshInterval: (latest) => (latest && (latest.video?.state === 'processing' || latest.publishIntent) ? 2500 : 0),
  });
}

export function useVerification() {
  return useSWR<VerificationView>('/api/verification', fetcher);
}

/** Server-reported state of one (simulated) upload; polls while it is still processing. */
export function useUploadState(id: string | null | undefined) {
  return useSWR<UploadView>(id ? `/api/uploads/${id}` : null, fetcher, {
    refreshInterval: (latest) => (latest && latest.state === 'processing' ? 1000 : 0),
  });
}
