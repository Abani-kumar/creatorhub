import { beforeEach, describe, expect, it } from 'vitest';
import {
  initialSim, INTERRUPT_AT_PERCENT, isTransferActive, simReducer, TICKS_TO_COMPLETE, validateVideoFile,
  type SimEvent, type SimState,
} from '@/lib/upload-sim';
import {
  clampStep, draftKey, emptyDraft, firstStepWithError, furthestReachableStep, parseDraft, serializeDraft,
  startResubmission, stepForFieldPath, toSubmission, type WizardDraft,
} from '@/lib/verification-draft';
import { api, register, signIn, store, useFreshApp, validVerification } from './helpers';

useFreshApp();

const FILE = { name: 'tutorial.mp4', sizeBytes: 150 * 1024 * 1024, contentType: 'video/mp4' };
const run = (s: SimState, ...events: SimEvent[]) => events.reduce(simReducer, s);
const ticks = (n: number): SimEvent[] => Array.from({ length: n }, () => ({ type: 'tick' }));
const started = (over: Partial<Extract<SimEvent, { type: 'started' }>> = {}): SimEvent => ({ type: 'started', uploadId: 'upl_1', partCount: 20, simulateInterruption: false, ...over });

describe('upload simulator', () => {
  it('walks select -> starting -> uploading -> finishing -> processing -> ready', () => {
    let s = run(initialSim, { type: 'select', file: FILE });
    expect(s.phase).toBe('starting');
    s = run(s, started());
    expect(s.phase).toBe('uploading');
    s = run(s, ...ticks(TICKS_TO_COMPLETE));
    expect(s.phase).toBe('finishing');
    expect(s.progress).toBe(100);
    expect(s.partsDone).toBe(20);
    s = run(s, { type: 'completed' }, { type: 'server-state', state: 'ready' });
    expect(s.phase).toBe('ready');
  });

  it('pause freezes progress and resume continues from the same point', () => {
    let s = run(initialSim, { type: 'select', file: FILE }, started(), ...ticks(6));
    const at = s.progress;
    s = run(s, { type: 'pause' }, ...ticks(10)); // ticks while paused are ignored
    expect(s.phase).toBe('paused');
    expect(s.progress).toBe(at);
    s = run(s, { type: 'resume' }, ...ticks(1));
    expect(s.phase).toBe('uploading');
    expect(s.progress).toBeGreaterThan(at);
  });

  it('an injected interruption keeps only whole parts and resumes from there, exactly once', () => {
    let s = run(initialSim, { type: 'select', file: FILE }, started({ simulateInterruption: true }));
    s = run(s, ...ticks(TICKS_TO_COMPLETE)); // would finish, but the connection drops at ~55%
    expect(s.phase).toBe('interrupted');
    expect(s.partsDone).toBeGreaterThan(0);
    expect(s.partsDone).toBeLessThan(s.partCount);
    // progress rolled back to the last acknowledged part boundary, never past the drop point
    expect(s.progress).toBeCloseTo((s.partsDone / s.partCount) * 100);
    expect(s.progress).toBeLessThanOrEqual(INTERRUPT_AT_PERCENT + 100 / TICKS_TO_COMPLETE);
    expect(s.message).toContain(`part ${s.partsDone + 1}`);

    const resumedFrom = s.partsDone;
    s = run(s, { type: 'retry' });
    expect(s.phase).toBe('uploading');
    s = run(s, ...ticks(TICKS_TO_COMPLETE));
    expect(s.phase).toBe('finishing'); // one-shot: it does not drop a second time
    expect(s.partsDone).toBeGreaterThanOrEqual(resumedFrom);
  });

  it('a failed server-side processing step ends in "failed" with guidance, not "ready"', () => {
    const s = run(initialSim, { type: 'select', file: FILE }, started(), ...ticks(TICKS_TO_COMPLETE), { type: 'completed' }, { type: 'server-state', state: 'failed' });
    expect(s.phase).toBe('failed');
    expect(s.message).toMatch(/upload it again/i);
  });

  it('a failed init can be retried from the start; a failed completion re-completes without re-uploading', () => {
    let s = run(initialSim, { type: 'select', file: FILE }, { type: 'request-failed', message: 'offline' });
    expect(s.phase).toBe('error');
    expect(simReducer(s, { type: 'retry' }).phase).toBe('starting');

    s = run(initialSim, { type: 'select', file: FILE }, started(), ...ticks(TICKS_TO_COMPLETE), { type: 'request-failed', message: 'offline' });
    s = simReducer(s, { type: 'retry' });
    expect(s.phase).toBe('finishing');
    expect(s.progress).toBe(100);
  });

  it('ignores events that do not apply to the current phase', () => {
    expect(simReducer(initialSim, { type: 'tick' })).toBe(initialSim);
    expect(simReducer(initialSim, { type: 'pause' })).toBe(initialSim);
    expect(simReducer(initialSim, { type: 'completed' })).toBe(initialSim);
    const processing = run(initialSim, { type: 'select', file: FILE }, started(), ...ticks(TICKS_TO_COMPLETE), { type: 'completed' });
    expect(simReducer(processing, { type: 'pause' })).toBe(processing);
  });

  it('ignores a late "started" after the user cancelled or before anything was selected', () => {
    const cancelled = run(initialSim, { type: 'select', file: FILE }, { type: 'reset' }, started());
    expect(cancelled).toEqual(initialSim);
    const mid = run(initialSim, { type: 'select', file: FILE }, started(), ...ticks(3));
    expect(simReducer(mid, started({ uploadId: 'upl_other' }))).toBe(mid); // never rebinds a running upload
  });

  it('reset returns to idle', () => {
    expect(run(initialSim, { type: 'select', file: FILE }, started(), { type: 'reset' })).toEqual(initialSim);
  });

  it('marks in-flight and recoverable phases as active so the form will not save a half-finished upload', () => {
    for (const p of ['starting', 'uploading', 'paused', 'interrupted', 'finishing', 'error'] as const) expect(isTransferActive(p)).toBe(true);
    for (const p of ['idle', 'processing', 'ready', 'failed'] as const) expect(isTransferActive(p)).toBe(false);
  });

  it('validates files with the same rules as the server', () => {
    expect(validateVideoFile(FILE)).toBeNull();
    expect(validateVideoFile({ ...FILE, name: 'notes.pdf', contentType: 'application/pdf' })).toMatch(/Unsupported format/);
    expect(validateVideoFile({ ...FILE, name: 'clip.mp4', contentType: 'image/png' })).toMatch(/not a video/);
    expect(validateVideoFile({ ...FILE, sizeBytes: 11 * 1024 ** 3 })).toMatch(/10 GB/);
    expect(validateVideoFile({ ...FILE, sizeBytes: 0 })).toMatch(/empty/i);
  });
});

describe('verification wizard draft', () => {
  const complete = (): WizardDraft => ({
    version: 1,
    step: 3,
    personal: { ...validVerification.personal },
    document: { type: 'passport', fileName: 'passport.jpg', sizeBytes: 800_000 },
    selfie: { method: 'simulated', completedAt: '2026-10-10T09:00:00.000Z' },
  });

  it('survives a refresh: serialize -> parse is lossless', () => {
    const d = complete();
    expect(parseDraft(serializeDraft(d))).toEqual(d);
  });

  it('is keyed per creator so two accounts in one browser never share a draft', () => {
    expect(draftKey('cr_a')).not.toBe(draftKey('cr_b'));
  });

  it.each([null, '', 'not json', '{"version":2}', '[]', 'null', '{"version":1,"step":99,"selfie":{"method":"x"}}'])('never throws on bad storage (%s)', (raw) => {
    const d = parseDraft(raw);
    expect(d.version).toBe(1);
    expect([0, 1, 2, 3]).toContain(d.step);
    expect(d.selfie).toBeNull();
  });

  it('cannot land on a later step than the data supports (e.g. a refreshed draft with the document missing)', () => {
    expect(furthestReachableStep(emptyDraft())).toBe(0);
    const noDoc = { ...complete(), document: {} };
    expect(furthestReachableStep(noDoc)).toBe(1);
    expect(clampStep({ ...noDoc, step: 3 }).step).toBe(1);
    const noSelfie = { ...complete(), selfie: null };
    expect(furthestReachableStep(noSelfie)).toBe(2);
    expect(furthestReachableStep(complete())).toBe(3);
    expect(clampStep(complete()).step).toBe(3);
  });

  it('builds a body the server schema accepts, only from a complete draft', async () => {
    expect(toSubmission(emptyDraft())).toBeNull();
    expect(toSubmission({ ...complete(), selfie: null })).toBeNull();
    const body = toSubmission(complete());
    expect(body).not.toBeNull();

    const sam = await signIn('sam');
    const res = await api.verify(sam, body);
    expect(res.status).toBe(201);
    expect(res.json.verification.status).toBe('pending_review');
  });

  it('routes server field errors back to the step that owns them', () => {
    expect(stepForFieldPath('personal.dateOfBirth')).toBe(0);
    expect(stepForFieldPath('document.sizeBytes')).toBe(1);
    expect(stepForFieldPath('selfie.completedAt')).toBe(2);
    expect(firstStepWithError({ 'selfie.method': 'x', 'document.type': 'y' })).toBe(1);
    expect(firstStepWithError({})).toBeNull();
  });

  it('a resubmission keeps personal details but clears what a reviewer rejects', () => {
    const next = startResubmission(complete());
    expect(next.step).toBe(0);
    expect(next.personal).toEqual(complete().personal);
    expect(next.document).toEqual({});
    expect(next.selfie).toBeNull();
  });
});

describe('GET /api/verification', () => {
  it('requires a session', async () => {
    expect((await api.verificationGet()).status).toBe(401);
  });

  it('returns the owner\'s summary without date of birth or address', async () => {
    const sam = await signIn('sam');
    expect((await api.verificationGet(sam)).json).toMatchObject({ status: 'unverified', submission: null });

    await api.verify(sam);
    const res = await api.verificationGet(sam);
    expect(res.status).toBe(200);
    expect(res.json.status).toBe('pending_review');
    expect(res.json.submission).toEqual({ fullName: 'Sam Rivera', country: 'US', documentType: 'passport', documentFileName: 'passport.jpg', selfieMethod: 'simulated' });
    const text = JSON.stringify(res.json);
    expect(text).not.toContain('1992-05-14');
    expect(text).not.toContain('Pine Street');
  });

  it('is scoped to the caller: a new creator never sees someone else\'s submission', async () => {
    const sam = await signIn('sam');
    await api.verify(sam);
    const { cookie: riley } = await register();
    expect((await api.verificationGet(riley)).json).toMatchObject({ status: 'unverified', submission: null });
  });

  it('does not write to the database', async () => {
    const sam = await signIn('sam');
    const before = store.stats.writes;
    await api.verificationGet(sam);
    await api.verificationGet(sam);
    expect(store.stats.writes).toBe(before);
  });
});

describe('local content cache (hosted demo fallback)', () => {
  const mem: Record<string, string> = {};
  beforeEach(() => {
    for (const k of Object.keys(mem)) delete mem[k];
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => mem[k] ?? null,
        setItem: (k: string, v: string) => { mem[k] = v; },
        removeItem: (k: string) => { delete mem[k]; },
      },
    });
  });

  it('rehydrates a just-saved item into an empty list page', async () => {
    const { rememberContent, mergeLocalContentIntoPage } = await import('@/lib/local-content-cache');
    rememberContent({
      id: 'c_new', title: 'Brand new', description: 'x', priceCents: 999, thumbnailUrl: '/thumbs/c_new',
      video: null, status: 'draft', scheduledFor: null, publishedAt: null, publishIntent: null,
      lastPublishError: null, views: 0, createdAt: '', updatedAt: '', purchases: 0, revenueCents: 0,
      waitingOn: [], blockers: [],
    });
    const merged = mergeLocalContentIntoPage(
      { items: [], page: 1, pageSize: 8, total: 0, totalPages: 1 },
      '/api/content?page=1',
    );
    expect(merged.items.map((c) => c.id)).toEqual(['c_new']);
    expect(merged.total).toBe(1);
  });
});
