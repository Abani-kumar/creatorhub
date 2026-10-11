import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  -> ' + x : ''}`); };
const demo = (page, body) => page.evaluate((b) => fetch('/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }), body);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(`${BASE}/sign-in`);
await page.getByRole('button', { name: /Maya Okafor/ }).click();
await page.waitForURL('**/dashboard');

async function fillAndUpload(title) {
  await page.goto(`${BASE}/content/new`);
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Description').fill('A description that is comfortably long enough to publish.');
  await page.getByLabel('Price (USD)').fill('9.99');
  await page.getByRole('radio', { name: /Preset dusk/i }).click();
  await page.locator('input[type=file][accept*="video"]').setInputFiles('e2e/fixtures/clip.mp4');
}

// 1. Schedule through the form
await fillAndUpload('E2E scheduled item');
await page.getByText('Processing video').waitFor({ timeout: 20000 });
await page.getByRole('radio', { name: 'Schedule' }).click();
const soon = new Date(Date.now() + 2 * 3600_000); const pad = (n) => String(n).padStart(2, '0');
const local = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
await page.getByLabel('Go live at').fill(local);
// While the video is still processing the server refuses to schedule, and the form explains and offers a choice.
await page.getByRole('button', { name: /^Schedule$/ }).click();
const early = page.getByRole('dialog');
await early.getByRole('heading', { name: /Can.t schedule yet/ }).waitFor({ timeout: 8000 }).then(() => check('scheduling while the video processes is refused with a dialog', true)).catch(() => check('scheduling while the video processes is refused with a dialog', false));
await early.getByRole('button', { name: 'Keep editing' }).click();
await page.getByText('Ready', { exact: true }).first().waitFor({ timeout: 20000 });
await page.getByRole('button', { name: /^Schedule$/ }).click();
await page.waitForURL(/\/content\/cnt_/);
await page.getByText('Scheduled', { exact: true }).first().waitFor({ timeout: 10000 }).then(() => check('schedule via form once ready => Scheduled status', true)).catch(() => check('schedule via form once ready => Scheduled status', false));
await page.getByText(/Goes live/).first().waitFor({ timeout: 10000 }).then(() => check('details shows the go-live time', true)).catch(() => check('details shows the go-live time', false));
// past time rejected
await page.goto(`${BASE}/content/new`);
await page.getByLabel('Title', { exact: true }).fill('Bad schedule');
await page.getByRole('radio', { name: 'Schedule' }).click();
await page.getByLabel('Go live at').fill('2020-01-01T10:00');
await page.getByRole('button', { name: /^Schedule$/ }).click();
check('past schedule time rejected', await page.getByText(/at least 5 minutes from now/).first().isVisible());

// 2. Verified creator, video still processing, Publish now => dialog => queue
await fillAndUpload('E2E waits for processing');
await page.getByText('Processing video').waitFor({ timeout: 20000 });
await page.getByRole('radio', { name: 'Publish now' }).click();
await page.getByRole('button', { name: /^Publish$/ }).click();
const dlg = page.getByRole('dialog');
await dlg.getByRole('heading', { name: /Can.t publish yet/ }).waitFor({ timeout: 8000 }).then(() => check('verified + still processing => dialog opens', true)).catch(() => check('verified + still processing => dialog opens', false));
const queueBtn = dlg.getByRole('button', { name: /Publish automatically when ready/ });
check('dialog offers "publish automatically when ready"', await queueBtn.isVisible().catch(() => false));
await queueBtn.click();
await page.waitForURL(/\/content\/cnt_/);
await page.getByText('Set to publish automatically').first().waitFor({ timeout: 10000 }).then(() => check('creates a draft with intent', true)).catch(() => check('creates a draft with intent', false));
await page.getByText('Published', { exact: true }).first().waitFor({ timeout: 15000 }).then(() => check('publishes by itself once processing finishes', true)).catch(() => check('publishes by itself once processing finishes', false));

// 3. Unpublish then delete from details
await page.getByRole('button', { name: 'Unpublish' }).click();
await page.getByText('Draft', { exact: true }).first().waitFor();
check('unpublish returns it to Draft', true);
await page.getByRole('button', { name: 'Delete' }).first().click();
const confirm = page.getByRole('dialog');
check('delete asks for confirmation', await confirm.getByText(/can.t be undone/).isVisible());
await confirm.getByRole('button', { name: 'Delete' }).click();
await page.waitForURL('**/dashboard');
check('delete from details returns to dashboard', true);

// 4. Edit an existing published item keeps it live
await page.goto(`${BASE}/dashboard`);
await page.getByLabel('Search content by title').fill('Sourdough');
await page.getByRole('link', { name: /^Edit Beginner/ }).first().click();
await page.waitForURL(/\/edit$/); // wait for the editor: "Title" also substring-matches the dashboard's search box
await page.getByLabel('Title', { exact: true }).fill("Beginner's Guide to Sourdough (edited)");
await page.getByRole('button', { name: 'Save changes' }).click();
await page.waitForURL(/\/content\/cnt_[^/]+$/);
await page.getByRole('heading', { name: /edited/ }).waitFor({ timeout: 10000 });
check('editing a live item saves and stays Published', await page.getByText('Published', { exact: true }).first().isVisible());

// 5. Forced API errors on the NEW pages
const id = page.url().split('/').pop();
await demo(page, { action: 'set-api-errors', enabled: true });
await page.goto(`${BASE}/content/${id}`);
await page.getByText(/temporarily unavailable/).first().waitFor({ timeout: 8000 }).then(() => check('details page shows an error state with retry', true)).catch(() => check('details page shows an error state with retry', false));
check('error state has a Try again button', await page.getByRole('button', { name: 'Try again' }).first().isVisible().catch(() => false));
await demo(page, { action: 'set-api-errors', enabled: false });
await page.getByRole('button', { name: 'Try again' }).first().click();
await page.getByRole('heading', { name: /edited/ }).waitFor({ timeout: 8000 }).then(() => check('retry recovers once the API is back', true)).catch(() => check('retry recovers once the API is back', false));

// 6. Latency shows a loading state
await demo(page, { action: 'set-latency', ms: 2500 });
await page.goto(`${BASE}/content/${id}`);
await page.getByRole('status', { name: 'Loading content' }).waitFor({ timeout: 500 }).catch(() => null);
check('details page shows a loading skeleton under latency', await page.getByRole('status', { name: 'Loading content' }).isVisible().catch(() => false));
await demo(page, { action: 'set-latency', ms: 0 });

console.log(`${results.filter(Boolean).length}/${results.length}`);
await browser.close();
