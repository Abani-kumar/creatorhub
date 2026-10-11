import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SESSION_TTL_MS } from '@/lib/constants';
import type { RegisterInput } from '@/lib/schemas';
import type { Creator, Database, Session } from '@/lib/types';
import { ApiError } from '../errors';
import { newId } from './shared';

function sessionSecret(): string {
  return process.env.SESSION_SECRET || 'creatorhub-takehome-demo';
}

/** Cookie value: signed payload so any serverless instance can resolve Maya/Sam without shared memory. */
export function encodeSessionToken(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  const sig = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function decodeSessionToken(token: string | undefined): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
    if (!session?.id || !session.creatorId || !session.createdAt) return null;
    return session;
  } catch {
    return null;
  }
}

/**
 * DEMO AUTHENTICATION. Name + email creates a creator and a server-side session (HttpOnly cookie).
 * It proves nothing about who owns the email: there is no password and no email verification.
 * The creator id is always derived from the session, never accepted from the browser.
 */
export function createSession(db: Database, creatorId: string, now: Date): Session {
  const session: Session = { id: randomBytes(24).toString('base64url'), creatorId, createdAt: now.toISOString() };
  db.sessions.push(session);
  if (db.sessions.length > 200) db.sessions = db.sessions.slice(-200);
  return session;
}

export function registerCreator(db: Database, input: RegisterInput, now: Date): { creator: Creator; session: Session } {
  if (db.creators.some((c) => c.email.toLowerCase() === input.email)) {
    throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists', { fields: { email: 'This email is already registered' } });
  }
  const creator: Creator = {
    id: newId('cr'),
    name: input.name,
    email: input.email,
    createdAt: now.toISOString(),
    verification: { status: 'unverified', submission: null, submittedAt: null, reviewedAt: null, rejectionReason: null },
  };
  db.creators.push(creator);
  return { creator, session: createSession(db, creator.id, now) };
}

export function findSessionCreator(db: Readonly<Database>, cookieValue: string | undefined, now: Date): { session: Session; creator: Creator } | null {
  if (!cookieValue) return null;
  const signed = decodeSessionToken(cookieValue);
  const session = signed ?? db.sessions.find((s) => s.id === cookieValue) ?? null;
  if (!session || now.getTime() - Date.parse(session.createdAt) > SESSION_TTL_MS) return null;
  const creator = db.creators.find((c) => c.id === session.creatorId);
  return creator ? { session, creator } : null;
}

export function destroySession(db: Database, sessionId: string): void {
  db.sessions = db.sessions.filter((s) => s.id !== sessionId);
}
