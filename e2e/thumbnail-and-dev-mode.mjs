import { chromium } from 'playwright';
const BASE = process.env.BASE_URL;
const ok = (n, c, x='') => console.log(`${c?'PASS':'FAIL'}  ${n}${x?'  -> '+x:''}`);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(`${BASE}/sign-in`);
await page.getByRole('button', { name: /Maya Okafor/ }).click();
await page.waitForURL('**/dashboard');
// --- StrictMode check: arm the one-shot interruption, upload once, it must fire (not be eaten by a duplicate init)
await page.evaluate(() => fetch('/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'fail-next-upload', enabled: true }) }));
await page.goto(`${BASE}/content/new`);
await page.locator('input[type=file][accept*="video"]').setInputFiles('e2e/fixtures/clip.mp4');
await page.getByText(/Connection lost/).waitFor({ timeout: 20000 }).then(() => ok('dev/StrictMode: interruption toggle not swallowed by a duplicate init', true)).catch(() => ok('dev/StrictMode: interruption toggle not swallowed by a duplicate init', false));
// --- generated cover picker (paths only, no image bytes in JSON)
await page.getByRole('radio', { name: /Preset dusk/i }).click();
await page.getByAltText('Cover preview').waitFor();
const src = await page.getByAltText('Cover preview').getAttribute('src');
ok('preset cover uses /thumbs/ path', src?.startsWith('/thumbs/frame-dusk'), src ?? '');
await page.getByRole('button', { name: /New design/i }).click();
const src2 = await page.getByAltText('Cover preview').getAttribute('src');
ok('regenerate picks another /thumbs/ path', src2?.startsWith('/thumbs/cover-'), src2 ?? '');
await browser.close();
