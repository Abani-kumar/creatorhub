/**
 * Stand-in for the backend scheduler/worker. In production this would be a queue consumer or cron;
 * here it is a plain function with an injected clock, called by:
 *   - every write request (so saved state catches up before any change is made),
 *   - the explicit "Run scheduled jobs" demo action.
 * GET requests never call it, they only *compute* the same result in memory.
 */
import type { Content, Database } from '@/lib/types';
import { planTransition } from './publishing';

export interface JobSummary {
  published: number;
  scheduled: number;
  failed: number;
}

export function resolveContent(db: Readonly<Database>, content: Content, now: Date): Content {
  const creator = db.creators.find((c) => c.id === content.creatorId);
  if (!creator) return content;
  const upload = content.video ? db.uploads.find((u) => u.id === content.video!.uploadId) : undefined;
  return planTransition(content, { creator, upload, now }) ?? content;
}

export function runDueJobs(db: Database, now: Date): JobSummary {
  const summary: JobSummary = { published: 0, scheduled: 0, failed: 0 };
  db.content = db.content.map((c) => {
    const next = resolveContent(db, c, now);
    if (next === c) return c;
    if (next.status === 'published') summary.published += 1;
    else if (next.status === 'scheduled') summary.scheduled += 1;
    if (next.lastPublishError && next.lastPublishError !== c.lastPublishError) summary.failed += 1;
    return { ...next, updatedAt: now.toISOString() };
  });
  db.demo.jobsLastRunAt = now.toISOString();
  return summary;
}
