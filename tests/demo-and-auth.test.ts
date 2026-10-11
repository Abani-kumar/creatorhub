import { describe, expect, it } from 'vitest';
import { T0, api, call, demo, register, signIn, store, useFreshApp } from './helpers';
import { JsonStore, setStoreForTests } from '@/server/store';
import { buildSeed } from '@/server/seed';
import { GET as configGet } from '@/app/api/config/route';
import { POST as registerPost } from '@/app/api/auth/register/route';

useFreshApp();

describe('demo controls are fail-closed', () => {
  it.each([undefined, 'false', 'TRUE', '1'])('404s every demo endpoint when DEMO_MODE=%s', async (value) => {
    const maya = await signIn('maya');
    if (value === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = value;

    expect((await api.demoGet(maya)).status).toBe(404);
    expect((await demo(maya, { action: 'set-verification', status: 'verified' })).status).toBe(404);
    expect((await demo(undefined, { action: 'switch-account', account: 'maya' })).status).toBe(404);
    expect((await call(configGet, { path: '/api/config' })).json.demoMode).toBe(false);
  });

  it('works when DEMO_MODE=true and rejects actions outside the allowlist', async () => {
    const maya = await signIn('maya');
    expect((await api.demoGet(maya)).status).toBe(200);
    const bad = await demo(maya, { action: 'grant-admin' });
    expect(bad.status).toBe(400);
    const bad2 = await demo(maya, { action: 'set-verification', status: 'super-verified' });
    expect(bad2.status).toBe(400);
  });

  it('switching accounts uses a server-managed session cookie (HttpOnly)', async () => {
    const res = await demo(undefined, { action: 'switch-account', account: 'sam' });
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/);
    const cookie = res.headers.get('set-cookie')!.split(';')[0];
    expect((await api.me(cookie)).json.creator.name).toBe('Sam Rivera');
  });

  it('enables demo mode on Vercel unless DEMO_MODE=false', async () => {
    const prevVercel = process.env.VERCEL;
    const prevDemo = process.env.DEMO_MODE;
    process.env.VERCEL = '1';
    delete process.env.DEMO_MODE;
    expect((await call(configGet, { path: '/api/config' })).json.demoMode).toBe(true);
    process.env.DEMO_MODE = 'false';
    expect((await call(configGet, { path: '/api/config' })).json.demoMode).toBe(false);
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevDemo === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = prevDemo;
  });

  it('seeded-account cookie still works after the store is re-seeded (other serverless instance)', async () => {
    const cookie = await signIn('maya');
    setStoreForTests(new JsonStore(null, () => buildSeed(new Date(T0))));
    expect((await api.me(cookie)).json.creator.name).toBe('Maya Okafor');
    expect((await api.list(cookie)).json.total).toBe(14);
  });

  it('review requires a pending submission', async () => {
    const sam = await signIn('sam');
    expect((await demo(sam, { action: 'review', decision: 'approve' })).status).toBe(409);
  });

  it('reset restores seed data and keeps seeded-account sessions only', async () => {
    const maya = await signIn('maya');
    const { cookie: riley } = await register();
    await demo(maya, { action: 'load-empty' });
    expect((await api.list(maya)).json.total).toBe(0);
    await demo(maya, { action: 'reset' });
    expect((await api.list(maya)).json.total).toBe(14);
    expect((await api.me(maya)).status).toBe(200);
    expect((await api.me(riley)).status).toBe(401); // registered accounts are wiped
  });
});

describe('registration and verification can never self-approve', () => {
  it('creates an UNVERIFIED creator with a session, and ignores injected fields', async () => {
    const res = await call(registerPost, {
      method: 'POST', path: '/api/auth/register',
      body: { name: 'Eve Hacker', email: 'eve@example.com', verification: { status: 'verified' }, id: 'cr_maya', verified: true },
    });
    expect(res.status).toBe(201);
    expect(res.json.creator.verification.status).toBe('unverified');
    expect(res.json.creator.id).not.toBe('cr_maya');
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/);
  });

  it('rejects duplicate emails (409) and bad input (400)', async () => {
    await register('One', 'dup@example.com');
    const dup = await call(registerPost, { method: 'POST', path: '/api/auth/register', body: { name: 'Two', email: 'DUP@example.com' } });
    expect(dup.status).toBe(409);
    expect(dup.json.error.details.fields.email).toBeTruthy();
    const bad = await call(registerPost, { method: 'POST', path: '/api/auth/register', body: { name: 'x', email: 'nope' } });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.json.error.details.fields)).toEqual(expect.arrayContaining(['name', 'email']));
  });

  it('submitting verification only ever yields pending_review', async () => {
    const { cookie } = await register();
    const submitted = await api.verify(cookie, { ...(await import('./helpers')).validVerification, status: 'verified' });
    expect(submitted.status).toBe(201);
    expect(submitted.json.verification.status).toBe('pending_review');
    expect((await api.verify(cookie)).status).toBe(409); // already in review
    expect((await api.me(cookie)).json.creator.verification.status).toBe('pending_review');
  });

  it('validates the verification payload (age, country, document)', async () => {
    const { cookie } = await register();
    const { validVerification } = await import('./helpers');
    const res = await api.verify(cookie, {
      personal: { ...validVerification.personal, dateOfBirth: '2015-01-01', country: 'ZZ', fullName: 'Single' },
      document: { type: 'library_card', fileName: '', sizeBytes: 0 },
      selfie: validVerification.selfie,
    });
    expect(res.status).toBe(400);
    const fields = res.json.error.details.fields;
    expect(fields['personal.dateOfBirth']).toMatch(/18/);
    expect(fields['personal.country']).toBeTruthy();
    expect(fields['personal.fullName']).toBeTruthy();
    expect(fields['document.type']).toBeTruthy();
    expect(store.stats.writes).toBeGreaterThan(0);
  });
});
