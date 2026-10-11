/**
 * Thin wrapper around Next route handlers: demo gating, simulated latency/errors, session auth,
 * body validation and a single, consistent error format:
 *   { error: { code, message, details? } }   with details.fields = { fieldName: message } for validation errors.
 */
import { ZodError, type ZodType } from 'zod';
import { SESSION_COOKIE } from '@/lib/constants';
import type { ApiErrorBody, Creator } from '@/lib/types';
import { now as clockNow } from './clock';
import { ApiError } from './errors';
import { findSessionCreator } from './services/auth';
import { isDemoMode } from './services/demo';
import { getStore, type Store } from './store';

export interface Ctx<P> {
  req: Request;
  url: URL;
  params: P;
  now: Date;
  store: Store;
  /** Derived from the server-side session. NEVER from the request body, query or headers. */
  creatorId: string;
  creator: Creator;
  body<T>(schema: ZodType<T, any, any>): Promise<T>;
}

interface Opts {
  /** Simulated latency / forced failures from the demo panel apply to this route. */
  chaos?: boolean;
  /** Route only exists when DEMO_MODE=true; otherwise a plain 404 (fail closed). */
  demoOnly?: boolean;
}

type RouteCtx<P> = { params: Promise<P> };

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(headers as Record<string, string>) },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    const body: ApiErrorBody = { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } };
    return json(body, err.status);
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!(key in fields)) fields[key] = issue.message;
    }
    const body: ApiErrorBody = { error: { code: 'VALIDATION_FAILED', message: 'Please fix the highlighted fields', details: { fields } } };
    return json(body, 400);
  }
  console.error('[api] unexpected error', err);
  return json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' } } satisfies ApiErrorBody, 500);
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const raw = part.slice(i + 1).trim();
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      /* malformed %-encoding: keep the raw value; it will simply not match any session */
    }
    out[part.slice(0, i).trim()] = value;
  }
  return out;
}

export function sessionCookie(req: Request, sessionId: string): string {
  const secure = new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function prepare<P>(req: Request, rawCtx: RouteCtx<P> | undefined, opts: Opts) {
  if (opts.demoOnly && !isDemoMode()) throw new ApiError(404, 'NOT_FOUND', 'Not found');
  const store = getStore();
  const now = clockNow();
  const url = new URL(req.url);
  const params = (rawCtx ? await rawCtx.params : {}) as P;

  if (opts.chaos) {
    const demo = await store.read((db) => db.demo);
    if (demo.latencyMs > 0) await sleep(demo.latencyMs);
    if (demo.forceApiErrors) {
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable (simulated from the demo panel).');
    }
  }

  const sessionId = parseCookies(req.headers.get('cookie'))[SESSION_COOKIE];
  const found = await store.read((db) => {
    const r = findSessionCreator(db, sessionId, now);
    return r ? { sessionId: r.session.id, creator: r.creator } : null;
  });
  return { store, now, url, params, found };
}

function buildBody(req: Request) {
  return async <T,>(schema: ZodType<T, any, any>): Promise<T> => {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON');
    }
    return schema.parse(raw);
  };
}

/** Requires a signed-in creator. */
export function authed<P = Record<string, string>>(opts: Opts, handler: (ctx: Ctx<P>) => Promise<Response | unknown>) {
  return async (req: Request, rawCtx?: RouteCtx<P>): Promise<Response> => {
    try {
      const { store, now, url, params, found } = await prepare(req, rawCtx, opts);
      if (!found) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue');
      const out = await handler({ req, url, params, now, store, creatorId: found.creator.id, creator: found.creator, body: buildBody(req) });
      return out instanceof Response ? out : json(out);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export interface PublicCtx<P> extends Omit<Ctx<P>, 'creatorId' | 'creator'> {
  creatorId: string | null;
  sessionId: string | null;
}

/** Works with or without a session (register, demo actions, config). */
export function open<P = Record<string, string>>(opts: Opts, handler: (ctx: PublicCtx<P>) => Promise<Response | unknown>) {
  return async (req: Request, rawCtx?: RouteCtx<P>): Promise<Response> => {
    try {
      const { store, now, url, params, found } = await prepare(req, rawCtx, opts);
      const out = await handler({
        req, url, params, now, store,
        creatorId: found?.creator.id ?? null,
        sessionId: found?.sessionId ?? null,
        body: buildBody(req),
      });
      return out instanceof Response ? out : json(out);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
