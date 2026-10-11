'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, Check, CircleCheck, FileCheck2, Info, LoaderCircle, RotateCw, ScanFace, ShieldAlert, Trash2, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiClientError, api } from '@/lib/api-client';
import { COUNTRIES, countryName } from '@/lib/countries';
import { MAX_DOCUMENT_BYTES } from '@/lib/constants';
import { formatBytes } from '@/lib/format';
import { refreshAll } from '@/lib/hooks';
import { DOCUMENT_TYPES, documentSchema, personalInfoSchema, type PersonalInfo } from '@/lib/schemas';
import type { DocumentType } from '@/lib/types';
import {
  clampStep, draftKey, firstStepWithError, parseDraft, serializeDraft, startResubmission, toSubmission, WIZARD_STEPS,
  type WizardDraft, type WizardStep,
} from '@/lib/verification-draft';
import { Button } from '@/components/ui/button';
import { SelectInput, TextInput } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';

const DOC_LABEL: Record<DocumentType, string> = {
  passport: 'Passport',
  drivers_license: "Driver's licence",
  national_id: 'National ID card',
  residence_permit: 'Residence permit',
};

const storage = {
  get: (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* private mode / quota: the wizard still works, it just can't survive a refresh */ } },
  remove: (k: string) => { try { window.localStorage.removeItem(k); } catch { /* ignore */ } },
};

/** Clears a creator's saved draft (called once they are verified). */
export const clearVerificationDraft = (creatorId: string) => storage.remove(draftKey(creatorId));

/* ---------------------------------- wizard ---------------------------------- */

export function VerificationWizard({ creatorId, rejectionReason }: { creatorId: string; rejectionReason: string | null }) {
  const toast = useToast();
  const key = draftKey(creatorId);
  const [draft, setDraft] = useState<WizardDraft | null>(null); // null until read from storage (avoids a hydration mismatch)
  const [submitting, setSubmitting] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { setDraft(clampStep(parseDraft(storage.get(key)))); }, [key]);
  useEffect(() => { if (draft) storage.set(key, serializeDraft(draft)); }, [draft, key]);

  const step = draft?.step ?? 0;
  const hydrated = draft !== null;
  const lastStep = useRef<number | null>(null);
  // Move focus to the new step's heading so keyboard and screen-reader users land in the right place.
  // Not on first load: that would steal focus and scroll the page for no reason.
  useEffect(() => {
    if (!hydrated) return;
    if (lastStep.current !== null && lastStep.current !== step) headingRef.current?.focus();
    lastStep.current = step;
  }, [step, hydrated]);

  const patch = useCallback((fn: (d: WizardDraft) => WizardDraft) => setDraft((d) => (d ? fn(d) : d)), []);
  const goTo = useCallback((s: WizardStep) => patch((d) => ({ ...d, step: s })), [patch]);

  const submit = useCallback(async () => {
    if (!draft) return;
    const body = toSubmission(draft);
    if (!body) return;
    setSubmitting(true);
    setProblems([]);
    try {
      await api.post('/api/verification', body);
      // Keep what is correct for a possible resubmission; clear what a reviewer would reject.
      const next = startResubmission(draft);
      storage.set(key, serializeDraft(next));
      toast.success('Submitted. Your verification is in review.');
      await refreshAll();
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'VALIDATION_FAILED') {
        const fields = e.fields;
        setProblems(Object.entries(fields).map(([path, msg]) => `${path.split('.').pop()}: ${msg}`));
        const s = firstStepWithError(fields);
        if (s !== null) goTo(s);
      } else if (e instanceof ApiClientError && (e.code === 'VERIFICATION_IN_REVIEW' || e.code === 'ALREADY_VERIFIED')) {
        await refreshAll(); // someone/another tab already moved this along: show the real status
      } else {
        setProblems([e instanceof ApiClientError ? e.message : 'Something went wrong. Please try again.']);
      }
    } finally {
      setSubmitting(false);
    }
  }, [draft, key, goTo, toast]);

  if (!draft) return <div role="status" aria-label="Loading your progress" className="h-96 animate-shimmer rounded-card bg-line" />;

  return (
    <div className="mx-auto max-w-2xl">
      {rejectionReason && (
        <div role="alert" className="mb-5 flex gap-3 rounded-card border border-[#f3c3ca] bg-bad-soft p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-bad" aria-hidden />
          <div className="text-sm text-ink-2">
            <p className="font-semibold text-bad">Your last submission wasn&apos;t approved</p>
            <p className="mt-0.5">{rejectionReason}</p>
            <p className="mt-1 text-ink-3">Your personal details are kept. Add a new document and run the identity check again.</p>
          </div>
        </div>
      )}

      <Stepper step={step} />

      <section aria-labelledby="step-title" className="mt-5 rounded-card bg-surface p-4 shadow-card ring-1 ring-line sm:p-6">
        <h2 id="step-title" ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">{WIZARD_STEPS[step].label}</h2>

        {problems.length > 0 && (
          <div role="alert" className="mt-4 rounded-lg bg-bad-soft p-3 text-sm text-bad">
            <p className="font-medium">We couldn&apos;t submit yet:</p>
            <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}

        {step === 0 && <PersonalStep draft={draft} patch={patch} />}
        {step === 1 && <DocumentStep draft={draft} patch={patch} />}
        {step === 2 && <IdentityCheckStep draft={draft} patch={patch} />}
        {step === 3 && <ReviewStep draft={draft} goTo={goTo} onSubmit={submit} submitting={submitting} />}
      </section>

      <p className="mt-4 flex gap-2 text-xs leading-relaxed text-ink-3">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          This is a simulation. No identity-verification provider is involved, no document or photo is uploaded, and a reviewer decision is
          simulated from the demo controls. Your progress is saved in this browser, so a refresh won&apos;t lose it.
        </span>
      </p>
    </div>
  );
}

/* ---------------------------------- stepper ---------------------------------- */

function Stepper({ step }: { step: WizardStep }) {
  return (
    <>
      <p className="text-sm text-ink-3 sm:hidden" aria-hidden>
        Step {step + 1} of {WIZARD_STEPS.length}: <span className="font-medium text-ink">{WIZARD_STEPS[step].label}</span>
      </p>
      <ol aria-label="Verification progress" className="flex items-center gap-2 max-sm:mt-2">
        {WIZARD_STEPS.map((s, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={s.key} aria-current={current ? 'step' : undefined} className={clsx('flex items-center gap-2', i < WIZARD_STEPS.length - 1 && 'flex-1')}>
              <span className={clsx('grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ring-1', done ? 'bg-ok text-white ring-ok' : current ? 'bg-ink text-white ring-ink' : 'bg-surface text-ink-3 ring-line-strong')}>
                {done ? <Check className="size-4" aria-hidden /> : i + 1}
                <span className="sr-only">{done ? ' completed:' : current ? ' current:' : ''} {s.label}</span>
              </span>
              <span className={clsx('hidden text-sm font-medium whitespace-nowrap sm:block', current ? 'text-ink' : 'text-ink-3')} aria-hidden>{s.label}</span>
              {i < WIZARD_STEPS.length - 1 && <span className={clsx('h-px flex-1', done ? 'bg-ok' : 'bg-line-strong')} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/* ------------------------------- step 1: details ------------------------------- */

type StepProps = { draft: WizardDraft; patch: (fn: (d: WizardDraft) => WizardDraft) => void };

function PersonalStep({ draft, patch }: StepProps) {
  const [today, setToday] = useState('');
  useEffect(() => setToday(new Date().toISOString().slice(0, 10)), []);

  const form = useForm<PersonalInfo>({
    resolver: zodResolver(personalInfoSchema),
    mode: 'onTouched',
    defaultValues: { fullName: '', dateOfBirth: '', country: '', addressLine: '', city: '', postalCode: '', ...draft.personal },
  });
  const { errors } = form.formState;

  // Autosave every keystroke so a refresh mid-form keeps what was typed.
  useEffect(() => {
    const sub = form.watch((values) => patch((d) => ({ ...d, personal: values as Partial<PersonalInfo> })));
    return () => sub.unsubscribe();
  }, [form, patch]);

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => patch((d) => ({ ...d, personal: values, step: 1 })))} className="mt-1">
      <p className="mb-5 text-sm text-ink-3">Use the name and address on your ID, exactly as written. You must be 18 or older to sell content.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2" id="fullName" label="Full legal name" error={errors.fullName?.message}>
          <TextInput id="fullName" autoComplete="name" aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? 'fullName-err' : undefined} {...form.register('fullName')} />
        </Field>
        <Field id="dateOfBirth" label="Date of birth" error={errors.dateOfBirth?.message}>
          <TextInput id="dateOfBirth" type="date" max={today || undefined} autoComplete="bday" aria-invalid={!!errors.dateOfBirth} aria-describedby={errors.dateOfBirth ? 'dateOfBirth-err' : undefined} {...form.register('dateOfBirth')} />
        </Field>
        <Field id="country" label="Country" error={errors.country?.message}>
          <SelectInput label="Country" id="country" autoComplete="country" aria-invalid={!!errors.country} aria-describedby={errors.country ? 'country-err' : undefined} {...form.register('country')}>
            <option value="">Select your country</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </SelectInput>
        </Field>
        <Field className="sm:col-span-2" id="addressLine" label="Street address" error={errors.addressLine?.message}>
          <TextInput id="addressLine" autoComplete="street-address" aria-invalid={!!errors.addressLine} aria-describedby={errors.addressLine ? 'addressLine-err' : undefined} {...form.register('addressLine')} />
        </Field>
        <Field id="city" label="City" error={errors.city?.message}>
          <TextInput id="city" autoComplete="address-level2" aria-invalid={!!errors.city} aria-describedby={errors.city ? 'city-err' : undefined} {...form.register('city')} />
        </Field>
        <Field id="postalCode" label="Postal code" error={errors.postalCode?.message}>
          <TextInput id="postalCode" autoComplete="postal-code" aria-invalid={!!errors.postalCode} aria-describedby={errors.postalCode ? 'postalCode-err' : undefined} {...form.register('postalCode')} />
        </Field>
      </div>
      <div className="mt-6 flex justify-end">
        <Button type="submit" className="max-sm:w-full">Continue <ArrowRight className="size-4" aria-hidden /></Button>
      </div>
    </form>
  );
}

/* ------------------------------- step 2: document ------------------------------- */

function DocumentStep({ draft, patch }: StepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const doc = draft.document;

  const parsed = useMemo(() => documentSchema.safeParse({ type: doc.type, fileName: doc.fileName ?? '', sizeBytes: doc.sizeBytes ?? 0 }), [doc]);
  const typeError = showErrors && !doc.type ? 'Choose an ID type' : undefined;
  const missingFile = showErrors && !doc.fileName ? 'Upload a photo or scan of your document' : undefined;

  function onFile(file: File) {
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)) return setFileError('Use a JPEG, PNG, WebP or PDF file.');
    if (file.size > MAX_DOCUMENT_BYTES) return setFileError('File must be 10 MB or smaller.');
    if (file.size === 0) return setFileError('That file is empty.');
    setFileError(null);
    // Simulation: only the name and size are kept. The file itself is never read, sent or stored.
    patch((d) => ({ ...d, document: { ...d.document, fileName: file.name, sizeBytes: file.size } }));
  }

  return (
    <div className="mt-1">
      <p className="mb-5 text-sm text-ink-3">Choose the ID you&apos;ll use, then add a clear photo or scan of it.</p>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">ID type</legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {DOCUMENT_TYPES.map((t) => {
            const selected = doc.type === t;
            return (
              <label key={t} className={clsx('flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-[15px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent', selected ? 'border-ink bg-surface-2 font-medium' : 'border-line-strong hover:border-ink-3')}>
                <input type="radio" name="docType" value={t} checked={selected} onChange={() => patch((d) => ({ ...d, document: { ...d.document, type: t } }))} className="size-4 accent-[var(--color-ink)]" />
                {DOC_LABEL[t]}
              </label>
            );
          })}
        </div>
        {typeError && <p role="alert" className="mt-2 text-sm text-bad">{typeError}</p>}
      </fieldset>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium">Photo or scan</p>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        {doc.fileName ? (
          <div className="flex items-center gap-3 rounded-xl border border-line-strong p-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-ok-soft text-ok"><FileCheck2 className="size-5" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{doc.fileName}</p>
              <p className="text-xs text-ink-3">{formatBytes(doc.sizeBytes ?? 0)}. Simulated: not uploaded or stored.</p>
            </div>
            <Button size="icon" variant="ghost" aria-label="Choose a different file" title="Choose a different file" onClick={() => inputRef.current?.click()}><RotateCw className="size-4" aria-hidden /></Button>
            <Button size="icon" variant="danger-ghost" aria-label="Remove file" title="Remove file" onClick={() => patch((d) => ({ ...d, document: { type: d.document.type } }))}><Trash2 className="size-4" aria-hidden /></Button>
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-surface-2/60 px-4 py-8 text-center hover:border-ink-3 hover:bg-surface-2">
            <UploadCloud className="size-6 text-ink-2" aria-hidden />
            <span className="text-[15px] font-medium">Choose a file</span>
            <span className="text-sm text-ink-3">JPEG, PNG, WebP or PDF, up to 10 MB</span>
          </button>
        )}
        {(fileError || missingFile) && <p role="alert" className="mt-2 text-sm text-bad">{fileError ?? missingFile}</p>}
      </div>

      <StepNav
        onBack={() => patch((d) => ({ ...d, step: 0 }))}
        onNext={() => (parsed.success ? patch((d) => ({ ...d, step: 2 })) : setShowErrors(true))}
      />
    </div>
  );
}

/* ----------------------------- step 3: identity check ----------------------------- */

const CHECK_STAGES = ['Finding your face', 'Matching it to your document', 'Checking you are really there'];
const STAGE_MS = 1100;

function IdentityCheckStep({ draft, patch }: StepProps) {
  const [stage, setStage] = useState<number | null>(null); // null = not running
  const done = draft.selfie !== null;

  useEffect(() => {
    if (stage === null) return;
    if (stage >= CHECK_STAGES.length) {
      patch((d) => ({ ...d, selfie: { method: 'simulated', completedAt: new Date().toISOString() } }));
      setStage(null);
      return;
    }
    const t = setTimeout(() => setStage((s) => (s === null ? s : s + 1)), STAGE_MS);
    return () => clearTimeout(t);
  }, [stage, patch]);

  return (
    <div className="mt-1">
      <p className="mb-5 text-sm text-ink-3">A quick check that the person submitting is the person on the ID.</p>

      <div className="rounded-xl bg-night p-5 text-white sm:p-6">
        <div className="grid aspect-[4/3] max-h-64 w-full place-items-center rounded-lg bg-night-2 ring-1 ring-white/10 sm:aspect-video">
          {done ? (
            <span className="flex flex-col items-center gap-2 text-center"><CircleCheck className="size-10 text-[#5be0b2]" aria-hidden /><span className="text-sm font-medium">Identity check complete</span></span>
          ) : stage !== null ? (
            <span className="flex flex-col items-center gap-3 px-4 text-center">
              <LoaderCircle className="size-9 animate-spin text-[#9fb0ff]" aria-hidden />
              <span aria-live="polite" className="text-sm font-medium">{CHECK_STAGES[Math.min(stage, CHECK_STAGES.length - 1)]}…</span>
            </span>
          ) : (
            <span className="flex flex-col items-center gap-2 px-4 text-center"><ScanFace className="size-10 text-night-text" aria-hidden /><span className="text-sm text-night-text">Ready when you are</span></span>
          )}
        </div>
        <p className="mt-3 text-xs text-night-text">Simulated check: no camera, photo or biometric data is used.</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!done && stage === null && <Button onClick={() => setStage(0)}><ScanFace className="size-4" aria-hidden /> Start identity check</Button>}
        {done && <Button variant="secondary" onClick={() => { patch((d) => ({ ...d, selfie: null })); setStage(0); }}><RotateCw className="size-4" aria-hidden /> Run it again</Button>}
      </div>

      <StepNav onBack={() => patch((d) => ({ ...d, step: 1 }))} onNext={() => patch((d) => ({ ...d, step: 3 }))} nextDisabled={!done || stage !== null} nextHint={!done ? 'Complete the check to continue.' : undefined} />
    </div>
  );
}

/* -------------------------------- step 4: review -------------------------------- */

function ReviewStep({ draft, goTo, onSubmit, submitting }: { draft: WizardDraft; goTo: (s: WizardStep) => void; onSubmit: () => void; submitting: boolean }) {
  const [confirmed, setConfirmed] = useState(false);
  const p = draft.personal;
  const ready = toSubmission(draft) !== null;

  return (
    <div className="mt-1">
      <p className="mb-5 text-sm text-ink-3">Check everything before you submit. A reviewer will look at it next.</p>

      <div className="divide-y divide-line rounded-xl border border-line">
        <ReviewRow title="Your details" onEdit={() => goTo(0)}>
          <p>{p.fullName}</p>
          <p className="text-ink-3">Born {p.dateOfBirth}. {p.addressLine}, {p.city} {p.postalCode}, {p.country ? countryName(p.country) : ''}</p>
        </ReviewRow>
        <ReviewRow title="ID document" onEdit={() => goTo(1)}>
          <p>{draft.document.type ? DOC_LABEL[draft.document.type] : ''}</p>
          <p className="break-all text-ink-3">{draft.document.fileName}{draft.document.sizeBytes ? ` (${formatBytes(draft.document.sizeBytes)})` : ''}</p>
        </ReviewRow>
        <ReviewRow title="Identity check" onEdit={() => goTo(2)}>
          <p className="flex items-center gap-1.5"><CircleCheck className="size-4 text-ok" aria-hidden /> Completed (simulated)</p>
        </ReviewRow>
      </div>

      <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink-2">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-ink)]" />
        I confirm these details are accurate and belong to me.
      </label>

      <StepNav
        onBack={() => goTo(2)}
        onNext={onSubmit}
        nextLabel="Submit for review"
        nextLoading={submitting}
        nextDisabled={!confirmed || !ready}
        nextHint={!ready ? 'Something above is incomplete. Use Edit to fix it.' : !confirmed ? 'Tick the box to submit.' : undefined}
      />
    </div>
  );
}

function ReviewRow({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 text-sm">
      <div className="min-w-0">
        <h3 className="mb-1 font-sans text-sm font-semibold">{title}</h3>
        <div className="space-y-0.5 text-ink">{children}</div>
      </div>
      <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}>Edit</Button>
    </div>
  );
}

/* --------------------------------- shared bits --------------------------------- */

function StepNav({
  onBack, onNext, nextLabel = 'Continue', nextDisabled, nextLoading, nextHint,
}: { onBack: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean; nextLoading?: boolean; nextHint?: string }) {
  return (
    <div className="mt-6">
      {nextHint && <p className="mb-3 text-right text-sm text-ink-3 max-sm:text-left">{nextHint}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={onBack} disabled={nextLoading}><ArrowLeft className="size-4" aria-hidden /> Back</Button>
        <Button onClick={onNext} disabled={nextDisabled} loading={nextLoading}>{nextLabel}{nextLabel === 'Continue' && <ArrowRight className="size-4" aria-hidden />}</Button>
      </div>
    </div>
  );
}

function Field({ id, label, error, className, children }: { id: string; label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
      {error && <p id={`${id}-err`} className="mt-1.5 text-sm text-bad">{error}</p>}
    </div>
  );
}
