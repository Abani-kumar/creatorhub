/**
 * Rebuild the JSON database from the deterministic seed:  npm run reset-demo
 *
 * Use it with the dev server STOPPED. A running server keeps its own in-memory copy and would overwrite this
 * file on its next write. (While the server is running, use the "Reset demo" button in the demo panel instead.)
 * Honors CREATORHUB_DB_PATH like the app does; ":memory:" has nothing to reset.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildSeed } from '../src/server/seed';

async function main() {
  const configured = process.env.CREATORHUB_DB_PATH ?? '.data/db.json';
  if (configured === ':memory:') {
    console.log('CREATORHUB_DB_PATH=:memory: has no file to reset.');
    return;
  }
  const file = path.resolve(process.cwd(), configured);
  const db = buildSeed(new Date());

  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db));
  await fs.rename(tmp, file); // atomic replace, same as the app's store

  const maya = db.content.filter((c) => c.creatorId === 'cr_maya').length;
  console.log(`Reset ${path.relative(process.cwd(), file)}: ${db.creators.length} creators, ${db.content.length} content (${maya} for Maya), ${db.purchases.length} purchases.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
