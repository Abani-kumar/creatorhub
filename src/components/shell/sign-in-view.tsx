'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, ShieldAlert, ShieldCheck, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';
import { ApiClientError, api } from '@/lib/api-client';
import { resetAll } from '@/lib/hooks';
import { registerSchema, type RegisterInput } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { BrandMark } from './brand';
import { TimelineArt } from './timeline-art';

export function SignInView() {
  const router = useRouter();
  const { data: config } = useSWR<{ demoMode: boolean; signedIn: boolean }>('/api/config');
  const [busy, setBusy] = useState<'maya' | 'sam' | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);

  useEffect(() => {
    if (config?.signedIn) router.replace('/dashboard');
  }, [config, router]);

  async function enterAs(account: 'maya' | 'sam') {
    setBusy(account);
    setDemoError(null);
    try {
      await api.post('/api/demo', { action: 'switch-account', account });
      await resetAll();
      router.push('/dashboard');
    } catch (e) {
      setDemoError(e instanceof ApiClientError ? e.message : 'Could not start the demo.');
      setBusy(null);
    }
  }

  const form = useForm<RegisterInput>({ resolver: zodResolver(registerSchema), defaultValues: { name: '', email: '' }, mode: 'onTouched' });
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(values: RegisterInput) {
    setFormError(null);
    try {
      await api.post('/api/auth/register', values);
      await resetAll();
      router.push('/dashboard');
    } catch (e) {
      if (e instanceof ApiClientError) {
        const fields = e.fields;
        if (fields.email) form.setError('email', { message: fields.email });
        else if (fields.name) form.setError('name', { message: fields.name });
        else setFormError(e.message);
      } else setFormError('Something went wrong. Please try again.');
    }
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-night px-14 py-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="font-display text-xl font-semibold">CreatorHub</span>
        </div>
        <div className="my-auto max-w-xl">
          <h1 className="font-display text-[3.25rem] leading-[1.02] font-semibold">Publish once.<br />Get paid every time they watch.</h1>
          <p className="mt-5 max-w-md text-lg text-night-text">Upload your videos, set your price and track what&apos;s earning, all from one portal built for creators.</p>
          <div className="mt-14"><TimelineArt /></div>
        </div>
        <p className="text-sm text-night-text/80">Creator Portal · demo build, all data is synthetic</p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <span className="font-display text-xl font-semibold">CreatorHub</span>
          </div>
          <h2 className="text-2xl font-semibold">Welcome to the Creator Portal</h2>
          <p className="mt-1.5 text-sm text-ink-3">Create an account, or explore with a demo creator.</p>

          {config?.demoMode && (
            <div className="mt-7 space-y-3">
              <h3 className="font-sans text-sm font-semibold text-ink">Explore the demo</h3>
              <DemoAccountButton
                onClick={() => enterAs('maya')}
                loading={busy === 'maya'}
                disabled={busy !== null}
                icon={<ShieldCheck className="size-5 text-ok" aria-hidden />}
                title="Maya Okafor"
                badge="Verified"
                body="Full dashboard: 14 videos, 400+ purchases, can publish."
              />
              <DemoAccountButton
                onClick={() => enterAs('sam')}
                loading={busy === 'sam'}
                disabled={busy !== null}
                icon={<ShieldAlert className="size-5 text-warn" aria-hidden />}
                title="Sam Rivera"
                badge="Not verified"
                body="Drafts only. Try publishing to see the verification gate."
              />
              {demoError && <p role="alert" className="text-sm text-bad">{demoError}</p>}
              <div className="flex items-center gap-3 pt-3 text-xs text-ink-3">
                <span className="h-px flex-1 bg-line" /> or create your own <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          )}

          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium">Your name</label>
              <TextInput id="name" autoComplete="name" placeholder="Riley Chen" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-err' : undefined} {...form.register('name')} />
              {errors.name && <p id="name-err" className="mt-1.5 text-sm text-bad">{errors.name.message}</p>}
            </div>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email</label>
              <TextInput id="email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-err' : undefined} {...form.register('email')} />
              {errors.email && <p id="email-err" className="mt-1.5 text-sm text-bad">{errors.email.message}</p>}
            </div>
            {formError && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{formError}</p>}
            <Button type="submit" className="w-full" loading={isSubmitting}>
              <UserPlus className="size-4" aria-hidden /> Create creator account
            </Button>
            <p className="text-xs leading-relaxed text-ink-3">
              Demo sign-up: no password and no email check, so this isn&apos;t real authentication. New accounts start unverified with an empty dashboard.
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}

function DemoAccountButton({
  onClick, loading, disabled, icon, title, badge, body,
}: { onClick: () => void; loading: boolean; disabled: boolean; icon: React.ReactNode; title: string; badge: string; body: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading || undefined}
      className="group flex w-full items-center gap-4 rounded-xl border border-line-strong bg-surface p-4 text-left transition-colors hover:border-ink disabled:opacity-60"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 ring-1 ring-line">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-semibold">{title}</span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-3 ring-1 ring-line">{badge}</span>
        </span>
        <span className="mt-0.5 block text-sm text-ink-3">{body}</span>
      </span>
      <ArrowRight className={`size-5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink ${loading ? 'animate-pulse' : ''}`} aria-hidden />
    </button>
  );
}
