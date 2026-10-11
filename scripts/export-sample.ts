/**
 * Write a reviewable snapshot of the seed data:  npm run export-sample
 * Uses a FIXED reference date so the output is identical on every run (the live seed is dated relative to "now").
 * Output: sample-data/seed.json, content.csv, purchases.csv. All data is synthetic.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildSeed } from '../src/server/seed';

const REFERENCE = new Date('2026-10-10T09:00:00.000Z');

async function main() {
  const db = buildSeed(REFERENCE);
  const outDir = path.resolve(process.cwd(), 'sample-data');
  await fs.mkdir(outDir, { recursive: true });

  const csv = (rows: Record<string, unknown>[]) => {
    const cols = Object.keys(rows[0] ?? {});
    const esc = (v: unknown) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
    return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
  };

  // Money is integer cents everywhere; the CSV keeps that so nothing is rounded in transit.
  const completed = db.purchases.filter((p) => p.status === 'completed');
  const content = db.content.map((c) => {
    const mine = completed.filter((p) => p.contentId === c.id);
    return {
      id: c.id, creator: c.creatorId, title: c.title, status: c.status, price_cents: c.priceCents ?? '', views: c.views,
      completed_purchases: mine.length, revenue_cents: mine.reduce((s, p) => s + p.amountCents, 0),
    };
  });

  await fs.writeFile(path.join(outDir, 'seed.json'), JSON.stringify({ ...db, sessions: [] }, null, 2));
  await fs.writeFile(path.join(outDir, 'content.csv'), csv(content));
  await fs.writeFile(path.join(outDir, 'purchases.csv'), csv(db.purchases.map((p) => ({ ...p }))));
  console.log(`Wrote ${db.content.length} content rows and ${db.purchases.length} purchases to ${path.relative(process.cwd(), outDir)}/ (reference date ${REFERENCE.toISOString()}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
