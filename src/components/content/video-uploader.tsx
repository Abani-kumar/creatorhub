'use client';
import clsx from 'clsx';
import { CirclePause, Film, Info, LoaderCircle, Play, RotateCw, Trash2, UploadCloud, X } from 'lucide-react';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ApiClientError, api } from '@/lib/api-client';
import { readVideoDuration } from '@/lib/browser-media';
import { formatBytes, formatDuration } from '@/lib/format';
import { useUploadState } from '@/lib/hooks';
import type { UploadInitResponse, UploadView, VideoRef } from '@/lib/types';
import { initialSim, isTransferActive, simReducer, TICK_MS, validateVideoFile, type PickedFile, type SimEvent, type SimState } from '@/lib/upload-sim';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const ACCEPT = 'video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv';

/**
 * SIMULATED video upload. The selected file never leaves the browser; the server stores only metadata.
 * All state transitions live in `simReducer` (unit-tested); this component only runs the timer and the API calls.
 */
export function VideoUploader({
  value, onChange, onBusyChange, error,
}: {
  value: VideoRef | null;
  onChange: (video: VideoRef | null) => void;
  /** True while a transfer is in flight or recoverable, so the form can refuse to save a half-finished upload. */
  onBusyChange: (busy: boolean) => void;
  error?: string;
}) {
  const [sim, dispatch] = useReducer(simReducer, initialSim);
  const [pickError, setPickError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<File | null>(null);
  const durationRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Latest callback without making effects re-run (and cancel in-flight requests) on every parent render.
  const onChangeRef = useRef(onChange);
  const onBusyChangeRef = useRef(onBusyChange);
  useEffect(() => {
    onChangeRef.current = onChange;
    onBusyChangeRef.current = onBusyChange;
  });

  const active = isTransferActive(sim.phase) || sim.phase === 'processing';

  useEffect(() => {
    onBusyChangeRef.current(isTransferActive(sim.phase));
  }, [sim.phase]);
  useEffect(() => () => onBusyChangeRef.current(false), []);

  /* ---- starting: open the (simulated) multipart upload ---- */
  // A token (not a cleanup flag) guards this call: React StrictMode runs effects twice in development, and a second
  // POST would create a duplicate upload and swallow the one-shot "interrupt next upload" demo setting.
  const initToken = useRef<symbol | null>(null);
  const initFor = useRef<PickedFile | null>(null);
  useEffect(() => {
    if (sim.phase !== 'starting' || !sim.file || initFor.current === sim.file) return;
    const file = sim.file;
    const token = Symbol('init');
    initFor.current = file;
    initToken.current = token;
    api
      .post<UploadInitResponse>('/api/uploads', { fileName: file.name, sizeBytes: file.sizeBytes, contentType: file.contentType })
      .then((res) => {
        if (initToken.current === token) dispatch({ type: 'started', uploadId: res.uploadId, partCount: res.partCount, simulateInterruption: res.simulateInterruption });
      })
      .catch((e) => {
        if (initToken.current !== token) return;
        initFor.current = null; // allow "Try again" to re-issue the request
        dispatch({ type: 'request-failed', message: e instanceof ApiClientError ? e.fields.fileName ?? e.message : 'Could not start the upload.' });
      });
  }, [sim.phase, sim.file]);

  /* ---- uploading: the timer stands in for network progress ---- */
  useEffect(() => {
    if (sim.phase !== 'uploading') return;
    const t = setInterval(() => dispatch({ type: 'tick' }), TICK_MS);
    return () => clearInterval(t);
  }, [sim.phase]);

  /* ---- finishing: tell the server every part arrived, then hand the video to the form ---- */
  useEffect(() => {
    if (sim.phase !== 'finishing' || !sim.uploadId || !sim.file) return;
    let cancelled = false;
    const { uploadId, file } = sim;
    api
      .post<UploadView>(`/api/uploads/${uploadId}/complete`)
      .then(() => {
        if (cancelled) return;
        dispatch({ type: 'completed' });
        onChangeRef.current({ uploadId, fileName: file.name, sizeBytes: file.sizeBytes, durationSec: durationRef.current });
      })
      .catch((e) => {
        if (!cancelled) dispatch({ type: 'request-failed', message: e instanceof ApiClientError ? e.message : 'Could not finish the upload.' });
      });
    return () => { cancelled = true; };
  }, [sim]);

  /* ---- processing: poll the server's view of the upload ---- */
  const processing = useUploadState(sim.phase === 'processing' ? sim.uploadId : null);
  useEffect(() => {
    const state = processing.data?.state;
    if (sim.phase === 'processing' && (state === 'ready' || state === 'failed')) dispatch({ type: 'server-state', state });
  }, [processing.data?.state, sim.phase]);

  /* ---- actions ---- */
  const pick = useCallback((file: File) => {
    const meta: PickedFile = { name: file.name, sizeBytes: file.size, contentType: file.type };
    const problem = validateVideoFile(meta);
    if (problem) {
      setPickError(problem);
      return;
    }
    setPickError(null);
    fileRef.current = file;
    durationRef.current = null;
    void readVideoDuration(file).then((d) => { if (fileRef.current === file) durationRef.current = d; });
    dispatch({ type: 'select', file: meta });
  }, []);

  function cancel() {
    initToken.current = null; // ignore any init response still in flight
    initFor.current = null;
    if (sim.uploadId && sim.phase !== 'processing') void api.post(`/api/uploads/${sim.uploadId}/abort`).catch(() => undefined);
    fileRef.current = null;
    dispatch({ type: 'reset' });
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) pick(f);
        e.target.value = ''; // allow choosing the same file again
      }}
    />
  );
  const browse = () => inputRef.current?.click();

  return (
    <div>
      {input}
      {active ? (
        <TransferPanel sim={sim} dispatch={dispatch} onCancel={cancel} />
      ) : value ? (
        <CurrentVideo video={value} onReplace={browse} onRemove={() => onChange(null)} />
      ) : (
        <button
          type="button"
          onClick={browse}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) pick(f);
          }}
          aria-describedby="uploader-note"
          className={clsx(
            'flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-9 text-center transition-colors',
            dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface-2/60 hover:border-ink-3 hover:bg-surface-2',
            (error || pickError) && 'border-bad',
          )}
        >
          <span className="grid size-11 place-items-center rounded-full bg-surface ring-1 ring-line"><UploadCloud className="size-5 text-ink-2" aria-hidden /></span>
          <span className="text-[15px] font-medium text-ink">Choose a video file</span>
          <span className="text-sm text-ink-3">or drop it here. MP4, MOV, WebM or MKV, up to 10 GB.</span>
        </button>
      )}

      {(pickError || error) && <p role="alert" className="mt-2 text-sm text-bad">{pickError ?? error}</p>}

      <p id="uploader-note" className="mt-3 flex gap-2 rounded-lg bg-info-soft px-3 py-2.5 text-xs leading-relaxed text-ink-2">
        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
        <span>
          <strong className="font-semibold text-ink">Simulated upload.</strong> Your video stays on this device. CreatorHub records only its
          name, size and type; no video is sent or stored. File type and size checks here are for convenience and are not a security control.
        </span>
      </p>
    </div>
  );
}

/* --------------------------------- panels --------------------------------- */

function TransferPanel({ sim, dispatch, onCancel }: { sim: SimState; dispatch: (e: SimEvent) => void; onCancel: () => void }) {
  const { phase, file, progress, partsDone, partCount, message } = sim;
  const pct = Math.round(progress);
  const interrupted = phase === 'interrupted';
  const errored = phase === 'error';
  const processing = phase === 'processing';

  const status: Record<string, string> = {
    starting: 'Preparing the upload…',
    uploading: `Uploading (simulated)… part ${Math.min(partsDone + 1, partCount)} of ${partCount}`,
    paused: 'Paused. Parts already sent are kept.',
    finishing: 'Finishing up…',
    processing: 'Processing video. This takes a few seconds in the demo.',
  };

  return (
    <div className={clsx('rounded-xl border bg-surface p-4', interrupted || errored ? 'border-bad/40' : 'border-line-strong')}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 ring-1 ring-line"><Film className="size-5 text-ink-2" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-ink">{file?.name}</p>
          <p className="text-xs text-ink-3">{file ? formatBytes(file.sizeBytes) : ''}</p>
        </div>
        {!processing && (
          <div className="flex shrink-0 items-center gap-1">
            {phase === 'uploading' && <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'pause' })}><CirclePause className="size-4" aria-hidden /> Pause</Button>}
            {phase === 'paused' && <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'resume' })}><Play className="size-4" aria-hidden /> Resume</Button>}
            <Button size="icon" variant="ghost" aria-label="Cancel upload" title="Cancel upload" onClick={onCancel}><X className="size-4" aria-hidden /></Button>
          </div>
        )}
      </div>

      {!processing && (
        <div className="mt-4">
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-2 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line"
          >
            <div className={clsx('h-full rounded-full transition-[width] duration-200', interrupted || errored ? 'bg-bad' : phase === 'paused' ? 'bg-ink-3' : 'bg-accent')} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-right text-xs text-ink-3 tabular-nums">{pct}%</p>
        </div>
      )}

      <div aria-live="polite" className="mt-1">
        {processing && <p className="mt-3 flex items-center gap-2 text-sm text-ink-2"><LoaderCircle className="size-4 animate-spin text-info" aria-hidden /> {status.processing}</p>}
        {(phase === 'starting' || phase === 'uploading' || phase === 'paused' || phase === 'finishing') && <p className="text-sm text-ink-2">{status[phase]}</p>}
      </div>

      {(interrupted || errored) && (
        <div role="alert" className="mt-2 rounded-lg bg-bad-soft p-3">
          <p className="text-sm text-bad">{message}</p>
          <Button size="sm" className="mt-3" onClick={() => dispatch({ type: 'retry' })}><RotateCw className="size-4" aria-hidden /> {interrupted ? 'Resume upload' : 'Try again'}</Button>
        </div>
      )}
    </div>
  );
}

function CurrentVideo({ video, onReplace, onRemove }: { video: VideoRef; onReplace: () => void; onRemove: () => void }) {
  const { data, isLoading } = useUploadState(video.uploadId);
  const state = data?.state;

  const badge = isLoading || !state ? null : {
    uploading: <Badge tone="bad">Never finished</Badge>,
    processing: <Badge tone="info">Processing</Badge>,
    ready: <Badge tone="ok">Ready</Badge>,
    failed: <Badge tone="bad">Failed</Badge>,
  }[state];

  return (
    <div className="rounded-xl border border-line-strong bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 ring-1 ring-line"><Film className="size-5 text-ink-2" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-ink">{video.fileName}</p>
          <p className="mt-0.5 text-xs text-ink-3">
            {formatBytes(video.sizeBytes)}
            {video.durationSec ? ` · ${formatDuration(video.durationSec)}` : ''}
          </p>
          <div className="mt-2" aria-live="polite">{badge}</div>
        </div>
      </div>

      {state === 'uploading' && <p className="mt-3 text-sm text-bad">This upload never finished. Select the file again to finish it.</p>}
      {state === 'failed' && <p className="mt-3 text-sm text-bad">Processing failed, so this video can&apos;t be published. Upload it again to retry.</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant={state === 'failed' || state === 'uploading' ? 'primary' : 'secondary'} onClick={onReplace}>
          <UploadCloud className="size-4" aria-hidden /> {state === 'failed' || state === 'uploading' ? 'Upload again' : 'Replace video'}
        </Button>
        <Button size="sm" variant="danger-ghost" onClick={onRemove}><Trash2 className="size-4" aria-hidden /> Remove</Button>
      </div>
    </div>
  );
}
