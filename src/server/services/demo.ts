/**
 * DEMO CONTROLS. Not production permissions.
 *  - Disabled unless DEMO_MODE === "true" (fail-closed: unset/anything else => endpoints 404).
 *  - Only the actions in the fixed allowlist (demoActionSchema) exist; unknown actions are a 400.
 *  - Ordinary registration / verification endpoints can never approve a creator.
 */
import type { DemoAction } from '@/lib/schemas';
import type { Database } from '@/lib/types';
import { ApiError } from '../errors';
import { runDueJobs, type JobSummary } from '../domain/jobs';
import { buildSeed, SEEDED, SEEDED_IDS } from '../seed';
import { demoReview, demoSetVerification } from './verification';
import { createSession } from './auth';

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

export interface DemoState {
  demoMode: true;
  currentCreatorId: string | null;
  settings: Database['demo'];
  accounts: { key: 'maya' | 'sam'; id: string; name: string; verification: string }[];
}

export function demoState(db: Readonly<Database>, currentCreatorId: string | null): DemoState {
  return {
    demoMode: true,
    currentCreatorId,
    settings: db.demo,
    accounts: (Object.entries(SEEDED) as ['maya' | 'sam', string][]).map(([key, id]) => {
      const c = db.creators.find((x) => x.id === id);
      return { key, id, name: c?.name ?? key, verification: c?.verification.status ?? 'unverified' };
    }),
  };
}

export interface DemoResult {
  newSessionId?: string;
  jobs?: JobSummary;
}

export function applyDemoAction(db: Database, creatorId: string | null, action: DemoAction, now: Date): DemoResult {
  if (action.action === 'switch-account') {
    const id = SEEDED[action.account];
    if (!db.creators.some((c) => c.id === id)) throw new ApiError(404, 'NOT_FOUND', 'Demo account missing. Reset the demo.');
    return { newSessionId: createSession(db, id, now).id };
  }

  if (action.action === 'reset') {
    const fresh = buildSeed(now);
    // Keep sessions of seeded accounts so the reviewer isn't logged out; registered accounts are wiped.
    fresh.sessions = db.sessions.filter((s) => SEEDED_IDS.includes(s.creatorId));
    Object.assign(db, fresh);
    return {};
  }

  // Everything below acts on the currently signed-in creator.
  const settingsActions = ['set-latency', 'set-api-errors', 'fail-next-upload', 'fail-next-processing', 'run-jobs'];
  if (!creatorId && !settingsActions.includes(action.action)) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in first');
  }

  switch (action.action) {
    case 'set-latency':
      db.demo.latencyMs = action.ms;
      return {};
    case 'set-api-errors':
      db.demo.forceApiErrors = action.enabled;
      return {};
    case 'fail-next-upload':
      db.demo.failNextUpload = action.enabled;
      return {};
    case 'fail-next-processing':
      db.demo.failNextProcessing = action.enabled;
      return {};
    case 'run-jobs':
      return { jobs: runDueJobs(db, now) };
    case 'review':
      demoReview(db, creatorId!, action.decision, action.reason, now);
      return {};
    case 'set-verification':
      demoSetVerification(db, creatorId!, action.status, now);
      return {};
    case 'load-empty':
      db.content = db.content.filter((c) => c.creatorId !== creatorId);
      db.purchases = db.purchases.filter((p) => p.creatorId !== creatorId);
      db.uploads = db.uploads.filter((u) => u.creatorId !== creatorId);
      return {};
  }
}
