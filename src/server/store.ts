/**
 * Persistence boundary.
 *
 * Services only talk to the `Store` interface: `read` for queries, `write` for a transaction.
 * `write` runs the callback against a COPY of the data, so a thrown error leaves nothing half-saved,
 * and writes are serialised through a queue so concurrent requests cannot interleave.
 *
 * JsonStore is for a SINGLE local instance (the assessment demo). In production this interface would
 * be backed by Postgres (a transaction per `write`), which is the only file that would change.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DB_VERSION } from '@/lib/constants';
import type { Database } from '@/lib/types';
import { now } from './clock';
import { buildSeed } from './seed';

export interface Store {
  read<T>(fn: (db: Readonly<Database>) => T): Promise<T>;
  write<T>(fn: (db: Database) => T): Promise<T>;
  readonly stats: { writes: number; persistent: boolean };
}

export class JsonStore implements Store {
  private db: Database | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  readonly stats = { writes: 0, persistent: true };

  constructor(
    private readonly file: string | null,
    private readonly seed: () => Database,
  ) {
    if (!file) this.stats.persistent = false;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(): Promise<Database> {
    if (this.db) return this.db;
    if (this.file) {
      try {
        const parsed = JSON.parse(await fs.readFile(this.file, 'utf8')) as Database;
        if (parsed.version === DB_VERSION) {
          this.db = parsed;
          return parsed;
        }
      } catch {
        /* missing or corrupt file: fall through and (re)seed */
      }
    }
    this.db = this.seed();
    await this.persist(this.db);
    return this.db;
  }

  /** Atomic write (temp file + rename). If the filesystem is read-only we degrade to in-memory. */
  private async persist(db: Database): Promise<void> {
    if (!this.file || !this.stats.persistent) return;
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(db));
      await fs.rename(tmp, this.file);
    } catch (err) {
      this.stats.persistent = false;
      console.warn('[store] cannot write to disk; continuing in memory only', err);
    }
  }

  /**
   * Reads wait for any in-flight write to finish, but concurrent GETs do not queue behind each other.
   * (Previously every read used `enqueue`, so a burst of SWR revalidations ran one-by-one and felt sluggish.)
   */
  read<T>(fn: (db: Readonly<Database>) => T): Promise<T> {
    const afterWrites = this.queue;
    return afterWrites.then(async () => fn(await this.load()));
  }

  write<T>(fn: (db: Database) => T): Promise<T> {
    return this.enqueue(async () => {
      const draft = structuredClone(await this.load());
      const result = fn(draft); // throws => draft discarded, nothing saved
      await this.persist(draft);
      this.db = draft;
      this.stats.writes += 1;
      return result;
    });
  }
}

const g = globalThis as unknown as { __creatorhubStore?: Store };

function resolveDbFile(): string | null {
  const configured = process.env.CREATORHUB_DB_PATH;
  if (configured === ':memory:') return null;
  if (configured) return path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured);
  // Vercel’s function filesystem is read-only except /tmp. Writes to `.data/` fail every request.
  if (process.env.VERCEL === '1') return '/tmp/creatorhub-db.json';
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), '.data/db.json');
}

export function getStore(): Store {
  if (!g.__creatorhubStore) {
    g.__creatorhubStore = new JsonStore(resolveDbFile(), () => buildSeed(now()));
  }
  return g.__creatorhubStore;
}

export function setStoreForTests(store: Store | null): void {
  g.__creatorhubStore = store ?? undefined;
}
