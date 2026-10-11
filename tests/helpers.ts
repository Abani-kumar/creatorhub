import { beforeEach } from 'vitest';
import { setClockForTests } from '@/server/clock';
import { buildSeed } from '@/server/seed';
import { JsonStore, setStoreForTests } from '@/server/store';
import type { ContentView } from '@/lib/types';

import { POST as demoPost, GET as demoGet } from '@/app/api/demo/route';
import { GET as contentList, POST as contentCreate } from '@/app/api/content/route';
import { GET as contentGet, PATCH as contentPatch, DELETE as contentDelete } from '@/app/api/content/[id]/route';
import { POST as contentPublish } from '@/app/api/content/[id]/publish/route';
import { POST as contentUnpublish } from '@/app/api/content/[id]/unpublish/route';
import { DELETE as intentCancel } from '@/app/api/content/[id]/publish-intent/route';
import { GET as overviewGet } from '@/app/api/overview/route';
import { GET as purchasesGet } from '@/app/api/purchases/route';
import { POST as uploadInit } from '@/app/api/uploads/route';
import { GET as uploadGet } from '@/app/api/uploads/[id]/route';
import { POST as uploadComplete } from '@/app/api/uploads/[id]/complete/route';
import { POST as uploadAbort } from '@/app/api/uploads/[id]/abort/route';
import { GET as verificationGet, POST as verificationPost } from '@/app/api/verification/route';
import { POST as registerPost } from '@/app/api/auth/register/route';
import { GET as meGet } from '@/app/api/me/route';

export const T0 = Date.parse('2026-10-10T09:00:00.000Z');
let t = T0;
export const advance = (ms: number) => { t += ms; };
export const clock = () => new Date(t);

export let store: JsonStore;

/** Fresh in-memory database + frozen clock for every test. */
export function useFreshApp() {
  beforeEach(() => {
    process.env.DEMO_MODE = 'true';
    t = T0;
    setClockForTests(() => new Date(t));
    store = new JsonStore(null, () => buildSeed(new Date(t)));
    setStoreForTests(store);
  });
}

interface CallOpts { method?: string; path?: string; body?: unknown; cookie?: string; params?: Record<string, string> }
export interface Res<T = any> { status: number; json: T; headers: Headers }

type Handler = (req: Request, ctx?: { params: Promise<any> }) => Promise<Response>;

export async function call<T = any>(handler: Handler, o: CallOpts = {}): Promise<Res<T>> {
  const headers: Record<string, string> = {};
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  const req = new Request(`http://localhost${o.path ?? '/'}`, {
    method: o.method ?? 'GET',
    headers,
    body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
  });
  const res = await handler(req, { params: Promise.resolve(o.params ?? {}) });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers };
}

export async function signIn(account: 'maya' | 'sam'): Promise<string> {
  const res = await call(demoPost, { method: 'POST', path: '/api/demo', body: { action: 'switch-account', account } });
  return res.headers.get('set-cookie')!.split(';')[0];
}

export async function register(name = 'Riley Test', email = `riley${Math.random().toString(36).slice(2, 8)}@example.com`) {
  const res = await call(registerPost, { method: 'POST', path: '/api/auth/register', body: { name, email } });
  return { res, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' };
}

export const demo = (cookie: string | undefined, body: unknown) =>
  call(demoPost, { method: 'POST', path: '/api/demo', body, cookie });

export const api = {
  demoGet: (cookie?: string) => call(demoGet, { path: '/api/demo', cookie }),
  list: (cookie: string, qs = '') => call(contentList, { path: `/api/content${qs}`, cookie }),
  create: (cookie: string, body: unknown) => call(contentCreate, { method: 'POST', path: '/api/content', body, cookie }),
  get: (cookie: string, id: string) => call<ContentView>(contentGet, { path: `/api/content/${id}`, cookie, params: { id } }),
  patch: (cookie: string, id: string, body: unknown) => call(contentPatch, { method: 'PATCH', path: `/api/content/${id}`, body, cookie, params: { id } }),
  del: (cookie: string, id: string) => call(contentDelete, { method: 'DELETE', path: `/api/content/${id}`, cookie, params: { id } }),
  publish: (cookie: string, id: string, body?: unknown) => call(contentPublish, { method: 'POST', path: `/api/content/${id}/publish`, body, cookie, params: { id } }),
  unpublish: (cookie: string, id: string) => call(contentUnpublish, { method: 'POST', path: `/api/content/${id}/unpublish`, cookie, params: { id } }),
  cancelIntent: (cookie: string, id: string) => call(intentCancel, { method: 'DELETE', path: `/api/content/${id}/publish-intent`, cookie, params: { id } }),
  overview: (cookie: string, range = 30) => call(overviewGet, { path: `/api/overview?range=${range}`, cookie }),
  purchases: (cookie: string, qs = '') => call(purchasesGet, { path: `/api/purchases${qs}`, cookie }),
  uploadInit: (cookie: string, body: unknown) => call(uploadInit, { method: 'POST', path: '/api/uploads', body, cookie }),
  uploadGet: (cookie: string, id: string) => call(uploadGet, { path: `/api/uploads/${id}`, cookie, params: { id } }),
  uploadComplete: (cookie: string, id: string) => call(uploadComplete, { method: 'POST', path: `/api/uploads/${id}/complete`, cookie, params: { id } }),
  uploadAbort: (cookie: string, id: string) => call(uploadAbort, { method: 'POST', path: `/api/uploads/${id}/abort`, cookie, params: { id } }),
  verify: (cookie: string, body: unknown = validVerification) => call(verificationPost, { method: 'POST', path: '/api/verification', body, cookie }),
  verificationGet: (cookie?: string) => call(verificationGet, { path: '/api/verification', cookie }),
  me: (cookie?: string) => call(meGet, { path: '/api/me', cookie }),
};

export const validVerification = {
  personal: { fullName: 'Sam Rivera', dateOfBirth: '1992-05-14', country: 'US', addressLine: '12 Pine Street', city: 'Austin', postalCode: '73301' },
  document: { type: 'passport', fileName: 'passport.jpg', sizeBytes: 800_000 },
  selfie: { method: 'simulated', completedAt: '2026-10-10T09:00:00.000Z' },
};

/** Full-record body (what the form sends) built from an existing view. */
export function bodyFrom(v: ContentView, over: Record<string, unknown> = {}) {
  return {
    title: v.title,
    description: v.description,
    priceCents: v.priceCents,
    thumbnailUrl: v.thumbnailUrl,
    video: v.video ? { uploadId: v.video.uploadId, fileName: v.video.fileName, sizeBytes: v.video.sizeBytes, durationSec: v.video.durationSec } : null,
    status: v.status,
    scheduledFor: v.scheduledFor,
    ...over,
  };
}

export async function findByTitle(cookie: string, needle: string): Promise<ContentView> {
  const res = await api.list(cookie, `?pageSize=50&q=${encodeURIComponent(needle)}`);
  const found = (res.json.items as ContentView[]).find((c) => c.title.includes(needle));
  if (!found) throw new Error(`No content matching "${needle}"`);
  return found;
}

/** Upload a (simulated) video; optionally wait until "processing" has finished. */
export async function uploadVideo(cookie: string, opts: { waitUntilReady?: boolean; name?: string } = {}) {
  const name = opts.name ?? 'demo.mp4';
  const init = await api.uploadInit(cookie, { fileName: name, sizeBytes: 150 * 1024 * 1024, contentType: 'video/mp4' });
  if (init.status !== 201) throw new Error(`upload init failed ${init.status}`);
  const id = init.json.uploadId as string;
  await api.uploadComplete(cookie, id);
  if (opts.waitUntilReady) advance(7_000);
  return { uploadId: id, fileName: name, sizeBytes: 150 * 1024 * 1024, durationSec: 120 };
}

export const completeBody = (video: unknown, over: Record<string, unknown> = {}) => ({
  title: 'A complete video',
  description: 'A description that is long enough to pass.',
  priceCents: 1299,
  thumbnailUrl: '/thumbs/frame-aurora',
  video,
  status: 'draft',
  scheduledFor: null,
  ...over,
});
