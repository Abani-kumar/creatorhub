'use client';
import clsx from 'clsx';
import { ArrowLeft, CalendarClock, CircleCheck, Circle, Clock, LoaderCircle, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { ApiClientError, api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { refreshAll, useMe, useUploadState } from '@/lib/hooks';
import { FRAME_PRESETS, thumbPath } from '@/lib/thumbnail-ref';
import { contentInputSchema, validateScheduleTime, type ContentInput } from '@/lib/schemas';
import { MIN_SCHEDULE_LEAD_MS } from '@/lib/constants';
import type { Blocker, ContentView, VerificationStatus, VideoRef } from '@/lib/types';
import { Button, LinkButton } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { PublishBlockedDialog, type BlockedInfo } from './publish-blocked-dialog';
import { ThumbnailPicker } from './thumbnail-picker';
import { VideoUploader } from './video-uploader';

type Mode = 'draft' | 'publish' | 'schedule';
type FieldKey = 'title' | 'description' | 'priceCents' | 'thumbnailUrl' | 'video' | 'scheduledFor';

const STATUS_FOR: Record<Mode, ContentInput['status']> = { draft: 'draft', publish: 'published', schedule: 'scheduled' };

/* ------------------------------ small helpers ------------------------------ */

/** "12.5" -> 1250, "" -> null, junk -> NaN (the schema reports NaN as "Enter a valid price"). Integer maths: no float cents. */
export function parsePriceToCents(input: string): number | null {
  const v = input.trim().replace(/^\$/, '');
  if (v === '') return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(v)) return Number.NaN;
  const [whole, frac = ''] = v.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export const centsToInput = (cents: number | null) => (cents == null ? '' : (cents / 100).toFixed(2));

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO instant -> value for <input type="datetime-local"> in the viewer's timezone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function initialMode(item?: ContentView): Mode {
  if (!item) return 'draft';
  if (item.status === 'published') return 'publish';
  if (item.status === 'scheduled') return 'schedule';
  // A pending "publish when ready" choice is kept when the creator edits other details.
  if (item.publishIntent) return item.publishIntent.kind === 'schedule' ? 'schedule' : 'publish';
  return 'draft';
}

const WAIT_LABEL: Partial<Record<Blocker['code'], string>> = {
  VERIFICATION_REQUIRED: 'identity verification', VERIFICATION_PENDING: 'verification approval', VERIFICATION_REJECTED: 'verification',
  VIDEO_UPLOADING: 'video upload', VIDEO_PROCESSING: 'video processing',
};

/* ---------------------------------- form ---------------------------------- */

export function ContentForm({ item }: { item?: ContentView }) {
  const router = useRouter();
  const toast = useToast();
  const { data: me } = useMe();

  const [contentId, setContentId] = useState<string | undefined>(item?.id);
  useEffect(() => { if (item?.id) setContentId(item.id); }, [item?.id]);

  const isLive = item?.status === 'published';
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(centsToInput(item?.priceCents ?? null));
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(item?.thumbnailUrl ?? thumbPath(FRAME_PRESETS[0]));
  const [video, setVideo] = useState<VideoRef | null>(
    item?.video ? { uploadId: item.video.uploadId, fileName: item.video.fileName, sizeBytes: item.video.sizeBytes, durationSec: item.video.durationSec } : null,
  );
  const [mode, setMode] = useState<Mode>(initialMode(item));
  const [scheduledLocal, setScheduledLocal] = useState(toLocalInput(item?.scheduledFor ?? item?.publishIntent?.scheduledFor ?? null));

  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [blocked, setBlocked] = useState<{ info: BlockedInfo; mode: Mode } | null>(null);
  const [cancellingIntent, setCancellingIntent] = useState(false);
  const [minSchedule, setMinSchedule] = useState('');
  useEffect(() => setMinSchedule(toLocalInput(new Date(Date.now() + MIN_SCHEDULE_LEAD_MS).toISOString())), []);

  const uploadState = useUploadState(video?.uploadId).data?.state ?? null;
  const verification: VerificationStatus = me?.creator.verification.status ?? 'unverified';

  /* ---- payload + validation (shared Zod schema; the server validates again) ---- */
  const buildPayload = useCallback((m: Mode, publishWhenReady: boolean): ContentInput => ({
    title,
    description,
    priceCents: parsePriceToCents(price),
    thumbnailUrl,
    video,
    status: isLive ? 'published' : m === 'draft' ? 'draft' : STATUS_FOR[m],
    scheduledFor: !isLive && m === 'schedule' ? fromLocalInput(scheduledLocal) : null,
    ...(publishWhenReady ? { publishWhenReady: true } : {}),
  }), [title, description, price, thumbnailUrl, video, isLive, scheduledLocal]);

  const effectiveId = contentId ?? item?.id;

  const clientErrors = useMemo(() => {
    const out: Partial<Record<FieldKey, string>> = {};
    const payload = buildPayload(mode, false);
    const parsed = contentInputSchema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldKey;
        if (!out[key]) out[key] = issue.message;
      }
    }
    if (!isLive && mode === 'schedule' && !out.scheduledFor) {
      const err = validateScheduleTime(payload.scheduledFor, new Date());
      if (err) out.scheduledFor = err;
    }
    return out;
  }, [buildPayload, mode, isLive]);

  const errorFor = (k: FieldKey) => ((submitted || touched.has(k)) ? serverErrors[k] ?? clientErrors[k] : undefined);
  const touch = (k: FieldKey) => setTouched((t) => (t.has(k) ? t : new Set(t).add(k)));
  const edit = <T,>(set: (v: T) => void, k: FieldKey) => (v: T) => {
    set(v);
    setServerErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };

  /* ---- warn before losing unsaved edits ---- */
  const initialSnapshot = useMemo(
    () => JSON.stringify([item?.title ?? '', item?.description ?? '', item?.priceCents ?? null, item?.thumbnailUrl ?? null, item?.video?.uploadId ?? null]),
    [item],
  );
  const dirty = JSON.stringify([title, description, parsePriceToCents(price), thumbnailUrl, video?.uploadId ?? null]) !== initialSnapshot;
  useEffect(() => {
    if (!dirty || saving) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, saving]);

  function handlePublishBlock(e: ApiClientError, m: Mode): 'blocked' {
    const details = e.details ?? {};
    if ((e.code === 'VERIFICATION_REQUIRED' || e.code === 'PUBLISH_NOT_READY') && Array.isArray(details.blockers)) {
      setBlocked({
        mode: m,
        info: {
          verificationStatus: (details.verificationStatus as VerificationStatus) ?? verification,
          deferrable: !!details.deferrable,
          blockers: details.blockers as Blocker[],
          rejectionReason: me?.creator.verification.rejectionReason,
        },
      });
      return 'blocked';
    }
    throw e;
  }

  async function persistDraftRecord(): Promise<ContentView | 'invalid'> {
    const payload = buildPayload('draft', false);
    const parsed = contentInputSchema.safeParse(payload);
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.path[0];
      if (typeof first === 'string') document.getElementById(`field-${first}`)?.focus();
      return 'invalid';
    }
    const id = effectiveId;
    const saved = id
      ? await api.patch<ContentView>(`/api/content/${id}`, payload)
      : await api.post<ContentView>('/api/content', payload);
    if (!id) setContentId(saved.id);
    if (saved.thumbnailUrl) setThumbnailUrl(saved.thumbnailUrl);
    return saved;
  }

  /* ---- submit: drafts via create/patch; publish/schedule via save-then-publish endpoint ---- */
  async function save(m: Mode, opts: { publishWhenReady?: boolean; navigate?: boolean } = {}): Promise<'saved' | 'blocked' | 'invalid' | 'failed'> {
    setSubmitted(true);
    setFormError(null);

    const publishMode = !isLive && (m === 'publish' || m === 'schedule');
    if (publishMode) {
      const checkPayload = buildPayload(m, false);
      const check = contentInputSchema.safeParse(checkPayload);
      if (!check.success) {
        const first = check.error.issues[0]?.path[0];
        if (typeof first === 'string') document.getElementById(`field-${first}`)?.focus();
        return 'invalid';
      }
      if (m === 'schedule') {
        const err = validateScheduleTime(checkPayload.scheduledFor, new Date());
        if (err) {
          setTouched((t) => new Set(t).add('scheduledFor'));
          return 'invalid';
        }
      }
    } else {
      const payload = buildPayload(m, false);
      const parsed = contentInputSchema.safeParse(payload);
      if (!parsed.success) {
        const first = parsed.error.issues[0]?.path[0];
        if (typeof first === 'string') document.getElementById(`field-${first}`)?.focus();
        return 'invalid';
      }
    }

    setSaving(true);
    try {
      if (isLive) {
        const payload = buildPayload('publish', false);
        const saved = await api.patch<ContentView>(`/api/content/${effectiveId!}`, payload);
        await refreshAll();
        toast.success('Changes saved.');
        if (opts.navigate !== false) router.push(`/content/${saved.id}`);
        return 'saved';
      }

      if (m === 'draft') {
        const draft = await persistDraftRecord();
        if (draft === 'invalid') return 'invalid';
        await refreshAll();
        toast.success('Draft saved.');
        if (opts.navigate !== false) router.push(`/content/${draft.id}`);
        return 'saved';
      }

      const draft = await persistDraftRecord();
      if (draft === 'invalid') return 'invalid';

      const publishBody: { scheduledFor?: string | null; publishWhenReady?: boolean } = {};
      if (m === 'schedule') publishBody.scheduledFor = fromLocalInput(scheduledLocal);
      if (opts.publishWhenReady) publishBody.publishWhenReady = true;

      try {
        const published = await api.post<ContentView>(`/api/content/${draft.id}/publish`, Object.keys(publishBody).length ? publishBody : undefined);
        await refreshAll();
        if (published.status === 'published') toast.success('Published.');
        else if (published.status === 'scheduled' && published.scheduledFor) toast.success(`Scheduled for ${formatDateTime(published.scheduledFor)}.`);
        else if (published.publishIntent) toast.success("Saved. We'll publish it automatically once it's ready.");
        else toast.success('Draft saved.');
        if (opts.navigate !== false) router.push(`/content/${published.id}`);
        return 'saved';
      } catch (e) {
        if (e instanceof ApiClientError) {
          await refreshAll();
          return handlePublishBlock(e, m);
        }
        throw e;
      }
    } catch (e) {
      if (e instanceof ApiClientError) {
        if (e.code === 'VALIDATION_FAILED') {
          setServerErrors(e.fields as Partial<Record<FieldKey, string>>);
          setFormError('Some details need attention. Check the highlighted fields.');
          return 'invalid';
        }
        setFormError(e.message);
        toast.error(e.message);
        return 'failed';
      }
      setFormError('Something went wrong. Please try again.');
      return 'failed';
    } finally {
      setSaving(false);
    }
  }

  async function cancelIntent() {
    if (!item) return;
    setCancellingIntent(true);
    try {
      await api.del(`/api/content/${item.id}/publish-intent`);
      await refreshAll();
      setMode('draft');
      toast.success('Automatic publishing cancelled. It stays a draft.');
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Could not cancel. Please try again.');
    } finally {
      setCancellingIntent(false);
    }
  }

  /* ---- checklist (informational; the server is the authority) ---- */
  const checklist = [
    { ok: title.trim().length >= 3, label: 'Title' },
    { ok: description.trim().length >= 10, label: 'Description' },
    { ok: parsePriceToCents(price) !== null && !Number.isNaN(parsePriceToCents(price)) && !clientErrors.priceCents, label: 'Price' },
    { ok: !!thumbnailUrl, label: 'Thumbnail' },
    video
      ? uploadState === 'ready' ? { ok: true, label: 'Video ready' }
        : uploadState === 'failed' || uploadState === 'uploading' ? { ok: false, bad: true, label: uploadState === 'failed' ? 'Video failed. Upload it again' : 'Video upload unfinished' }
        : { ok: false, wait: true, label: 'Video processing' }
      : { ok: false, label: 'Video' },
    verification === 'verified' ? { ok: true, label: 'Identity verified' }
      : { ok: false, wait: verification === 'pending_review', bad: verification === 'rejected', label: verification === 'pending_review' ? 'Identity in review' : verification === 'rejected' ? 'Identity not approved' : 'Identity not verified' },
  ] as { ok: boolean; wait?: boolean; bad?: boolean; label: string }[];

  const primaryLabel = isLive ? 'Save changes' : mode === 'draft' ? 'Save draft' : mode === 'publish' ? 'Publish' : 'Schedule';
  const disabledReason = uploadBusy ? 'Finish or cancel the upload before saving.' : null;
  const intentWaiting = item?.publishIntent ? [...new Set(item.waitingOn.map((b) => WAIT_LABEL[b.code]).filter(Boolean))].join(' and ') : '';

  return (
    <>
      <div className="mb-5">
        <Link href={item ? `/content/${item.id}` : '/dashboard'} className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-lg pr-2 text-sm text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> {item ? 'Back to details' : 'Back to dashboard'}
        </Link>
        <h1 className="text-[1.65rem] leading-tight font-semibold sm:text-3xl">{item ? 'Edit content' : 'New content'}</h1>
        <p className="mt-1 text-sm text-ink-3">
          {item ? 'Update the details, then save.' : 'Add the details and a video. You can save a draft at any time, before you verify your identity.'}
        </p>
      </div>

      {item?.publishIntent && (
        <div role="status" className="mb-5 flex flex-col gap-3 rounded-card border border-[#c9d0ff] bg-info-soft p-4 sm:flex-row sm:items-center">
          <Clock className="size-5 shrink-0 text-info" aria-hidden />
          <p className="flex-1 text-sm text-ink-2">
            <strong className="font-semibold text-ink">Set to {item.publishIntent.kind === 'schedule' ? 'schedule' : 'publish'} automatically.</strong>{' '}
            {intentWaiting ? `Waiting for ${intentWaiting}.` : 'It will go live as soon as everything is ready.'}
          </p>
          <Button size="sm" variant="secondary" onClick={cancelIntent} loading={cancellingIntent}>Cancel automatic publishing</Button>
        </div>
      )}
      {item?.lastPublishError && !item.publishIntent && (
        <p role="status" className="mb-5 flex gap-2 rounded-card border border-[#f3c3ca] bg-bad-soft p-4 text-sm text-bad">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {item.lastPublishError.message}
        </p>
      )}

      <form noValidate onSubmit={(e) => { e.preventDefault(); void save(mode); }} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21.5rem]">
        <div className="space-y-5">
          <Card title="Details">
            <div className="space-y-5">
              <Field id="field-title" label="Title" error={errorFor('title')} hint={`${title.trim().length}/100`}>
                {(p) => <TextInput {...p} value={title} maxLength={120} autoComplete="off" placeholder="e.g. Cinematic Color Grading in DaVinci Resolve" onChange={(e) => edit(setTitle, 'title')(e.target.value)} onBlur={() => touch('title')} />}
              </Field>
              <Field id="field-description" label="Description" error={errorFor('description')} hint={`${description.trim().length}/2000. At least 10 characters to publish`}>
                {(p) => <textarea {...p} value={description} rows={5} maxLength={2100} placeholder="What will people learn or see? What's included?" className="block min-h-32 w-full rounded-control border border-line-strong bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-3/80 hover:border-ink-3/60 focus:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 aria-[invalid=true]:border-bad sm:text-sm" onChange={(e) => edit(setDescription, 'description')(e.target.value)} onBlur={() => touch('description')} />}
              </Field>
              <Field id="field-priceCents" label="Price (USD)" error={errorFor('priceCents')} hint="From $0.99 to $999.99. Revenue on your dashboard counts the full sale price.">
                {(p) => (
                  <div className="relative max-w-[11rem]">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden>$</span>
                    <TextInput {...p} value={price} inputMode="decimal" autoComplete="off" placeholder="19.99" className="pl-7 tabular-nums" onChange={(e) => edit(setPrice, 'priceCents')(e.target.value)} onBlur={() => touch('priceCents')} />
                  </div>
                )}
              </Field>
            </div>
          </Card>

          <Card title="Thumbnail" description="Shown on your catalogue and in search.">
            <ThumbnailPicker contentId={effectiveId} value={thumbnailUrl} onChange={(v) => { edit(setThumbnailUrl, 'thumbnailUrl')(v); touch('thumbnailUrl'); }} error={errorFor('thumbnailUrl')} />
          </Card>

          <Card title="Video" description="Pick the file you want to sell.">
            <div id="field-video" tabIndex={-1}>
              <VideoUploader value={video} onChange={(v) => { edit(setVideo, 'video')(v); touch('video'); }} onBusyChange={setUploadBusy} error={errorFor('video')} />
            </div>
          </Card>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20">
          <Card title="Publishing">
            {isLive ? (
              <p className="text-sm text-ink-2">This content is <strong className="font-semibold text-ink">live</strong>. Changes you save appear straight away. To take it offline, unpublish it from the details page.</p>
            ) : (
              <div className="space-y-4">
                <Segmented<Mode>
                  label="When to publish"
                  value={mode}
                  onChange={setMode}
                  className="w-full [&>button]:flex-1 [&>button]:justify-center"
                  options={[{ value: 'draft', label: 'Draft' }, { value: 'publish', label: 'Publish now' }, { value: 'schedule', label: 'Schedule' }]}
                />
                {mode === 'schedule' && (
                  <Field id="field-scheduledFor" label="Go live at" error={errorFor('scheduledFor')} hint="Your local time. At least 5 minutes from now.">
                    {(p) => <TextInput {...p} type="datetime-local" min={minSchedule} value={scheduledLocal} onChange={(e) => edit(setScheduledLocal, 'scheduledFor')(e.target.value)} onBlur={() => touch('scheduledFor')} />}
                  </Field>
                )}
                {mode !== 'draft' && verification !== 'verified' && (
                  <p className="rounded-lg bg-warn-soft px-3 py-2.5 text-sm text-ink-2">
                    {verification === 'pending_review' ? "Your verification is still in review. We'll offer to publish this automatically once it's approved." : "You haven't verified your identity yet. We'll offer to save this and publish it automatically once you're verified."}
                  </p>
                )}
              </div>
            )}

            <ul aria-label="Publishing checklist" className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
              {checklist.map((c) => (
                <li key={c.label} className={clsx('flex items-center gap-2.5', c.ok ? 'text-ink-2' : c.bad ? 'text-bad' : 'text-ink-3')}>
                  {c.ok ? <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden /> : c.wait ? <LoaderCircle className="size-4 shrink-0 animate-spin text-info" aria-hidden /> : c.bad ? <TriangleAlert className="size-4 shrink-0" aria-hidden /> : <Circle className="size-4 shrink-0" aria-hidden />}
                  {c.label}
                  <span className="sr-only">{c.ok ? ', done' : c.wait ? ', in progress' : ', still needed'}</span>
                </li>
              ))}
            </ul>

            {formError && <p role="alert" className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{formError}</p>}
            {disabledReason && <p className="mt-4 text-sm text-ink-3">{disabledReason}</p>}

            <div className="mt-5 flex flex-col gap-2">
              <Button type="submit" loading={saving} disabled={uploadBusy}>
                {mode === 'schedule' && !isLive && <CalendarClock className="size-4" aria-hidden />} {primaryLabel}
              </Button>
              <LinkButton href={item ? `/content/${item.id}` : '/dashboard'} variant="ghost">Cancel</LinkButton>
            </div>
          </Card>
        </aside>
      </form>

      <PublishBlockedDialog
        open={!!blocked}
        onClose={() => setBlocked(null)}
        title={title.trim() || 'This content'}
        info={blocked?.info ?? null}
        action={blocked?.mode === 'schedule' ? 'schedule' : 'publish'}
        // Both of these re-submit through the same API, so the server decides again. Nothing is published by the client.
        onQueue={async (then) => {
          const r = await save(blocked?.mode ?? 'publish', { publishWhenReady: true, navigate: then !== 'verify' });
          if (r !== 'saved' && r !== 'blocked') throw new ApiClientError(0, 'NOT_SAVED', 'We could not save this. Check the highlighted fields and try again.');
        }}
        onSaveDraft={async () => {
          const r = await save('draft', { publishWhenReady: false });
          if (r !== 'saved') throw new ApiClientError(0, 'NOT_SAVED', 'We could not save the draft. Check the highlighted fields and try again.');
        }}
      />
    </>
  );
}

/* -------------------------------- layout bits -------------------------------- */

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-surface p-4 shadow-card ring-1 ring-line sm:p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-0.5 mb-4 text-sm text-ink-3">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </section>
  );
}

/** Label + control + error + hint, wired with aria-invalid / aria-describedby. */
function Field({
  id, label, error, hint, children,
}: { id: string; label: string; error?: string; hint?: string; children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode }) {
  const uid = useId();
  const describedBy = [error ? `${uid}-err` : null, hint ? `${uid}-hint` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy })}
      {error && <p id={`${uid}-err`} className="mt-1.5 text-sm text-bad">{error}</p>}
      {hint && <p id={`${uid}-hint`} className="mt-1.5 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}
