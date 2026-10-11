import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync, promises as fsPromises } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClockForTests } from '@/server/clock';
import { buildSeed } from '@/server/seed';
import { JsonStore, setStoreForTests } from '@/server/store';
import { api, signIn } from './helpers';

const NOW = new Date('2026-10-10T09:00:00Z');
const dirs: string[] = [];
const tmpFile = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'creatorhub-'));
  dirs.push(d);
  return path.join(d, 'db.json');
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('JsonStore', () => {
  it('persists across a "restart" (new instance reading the same file)', async () => {
    const file = tmpFile();
    const a = new JsonStore(file, () => buildSeed(NOW));
    await a.write((db) => { db.content[0].title = 'Renamed'; });
    const b = new JsonStore(file, () => buildSeed(NOW));
    expect(await b.read((db) => db.content[0].title)).toBe('Renamed');
  });

  it('discards the whole transaction when the callback throws', async () => {
    const store = new JsonStore(null, () => buildSeed(NOW));
    const before = await store.read((db) => db.content.length);
    await expect(store.write((db) => { db.content.pop(); throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await store.read((db) => db.content.length)).toBe(before);
  });

  it('serialises concurrent writes (no lost updates)', async () => {
    const store = new JsonStore(null, () => buildSeed(NOW));
    await Promise.all(Array.from({ length: 25 }, () => store.write((db) => { db.demo.latencyMs += 1; })));
    expect(await store.read((db) => db.demo.latencyMs)).toBe(25);
  });

  it('reseeds when the file is corrupt, and falls back to memory when the path is unwritable', async () => {
    const file = tmpFile();
    writeFileSync(file, '{ not json');
    const store = new JsonStore(file, () => buildSeed(NOW));
    expect(await store.read((db) => db.content.length)).toBe(17);
    expect(existsSync(file)).toBe(true);

    const blocked = new JsonStore(path.join(file, 'nested', 'db.json'), () => buildSeed(NOW)); // parent is a regular file => ENOTDIR
    await blocked.write((db) => { db.demo.latencyMs = 800; });
    expect(blocked.stats.persistent).toBe(false);
    expect(await blocked.read((db) => db.demo.latencyMs)).toBe(800); // still works in memory
  });
});

describe('JsonStore file safety', () => {
  it('replaces the file atomically: no temp files left behind, and the file always parses', async () => {
    const file = tmpFile();
    const store = new JsonStore(file, () => buildSeed(NOW));
    await Promise.all(Array.from({ length: 30 }, () => store.write((db) => { db.demo.latencyMs += 1; })));
    expect(readdirSync(path.dirname(file))).toEqual(['db.json']);
    const onDisk = JSON.parse(readFileSync(file, 'utf8'));
    expect(onDisk.demo.latencyMs).toBe(30); // disk matches memory: no lost update reached the file either
  });

  it('keeps the previous file intact if the final rename fails (a crash between write and replace)', async () => {
    const file = tmpFile();
    const store = new JsonStore(file, () => buildSeed(NOW));
    await store.write((db) => { db.demo.latencyMs = 800; });
    const good = readFileSync(file, 'utf8');

    const rename = vi.spyOn(fsPromises, 'rename').mockRejectedValueOnce(new Error('simulated crash before replace'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await store.write((db) => { db.demo.latencyMs = 2500; });
    rename.mockRestore();

    expect(readFileSync(file, 'utf8')).toBe(good); // the old, complete file is untouched, never a half-written one
    expect(JSON.parse(good).demo.latencyMs).toBe(800);
    expect(await store.read((db) => db.demo.latencyMs)).toBe(2500); // the running process still serves its latest state
  });

  it('GET handlers never touch the data file (checked on the bytes, not a counter)', async () => {
    const file = tmpFile();
    const store = new JsonStore(file, () => buildSeed(NOW));
    setStoreForTests(store);
    setClockForTests(() => NOW);
    process.env.DEMO_MODE = 'true';
    try {
      const cookie = await signIn('maya');
      await store.write((db) => { db.demo.latencyMs = 0; }); // make sure the file exists before we measure
      const before = readFileSync(file);
      const stat = statSync(file).mtimeMs;
      await api.list(cookie, '?pageSize=50');
      await api.overview(cookie);
      await api.purchases(cookie);
      await api.me(cookie);
      await api.verificationGet(cookie);
      const first = (await api.list(cookie)).json.items[0].id;
      await api.get(cookie, first);
      expect(readFileSync(file).equals(before)).toBe(true);
      expect(statSync(file).mtimeMs).toBe(stat);
    } finally {
      setStoreForTests(null);
      setClockForTests(null);
    }
  });
});
