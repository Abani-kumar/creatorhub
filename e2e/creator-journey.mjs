import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const shot = (page, name) => page.screenshot({ path: `e2e/shots/${name}.png`, fullPage: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + e.message));

// ---- 1. enter as Sam (unverified) ----
await page.goto(`${BASE}/sign-in`);
await page.getByRole('button', { name: /Sam Rivera/ }).click();
await page.waitForURL('**/dashboard');
await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
check('Sam lands on dashboard', true);
// Other e2e scripts may leave Sam rejected; this journey needs a clean unverified creator.
await page.evaluate(() => fetch('/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'set-verification', status: 'unverified' }) }));

// ---- 2. create content, upload (simulated), choose thumbnail ----
await page.getByRole('link', { name: /New content/ }).first().click();
await page.waitForURL('**/content/new');
await page.getByLabel('Title', { exact: true }).fill('E2E: Editing on a train');
await page.getByLabel('Description').fill('A description that is comfortably long enough to publish.');
await page.getByLabel('Price (USD)').fill('12.5');
await page.getByRole('radio', { name: /Preset aurora/i }).click();
await page.locator('input[type=file][accept*="video"]').setInputFiles('e2e/fixtures/clip.mp4');
await page.getByRole('progressbar', { name: 'Upload progress' }).waitFor();
check('upload progress bar appears', true);
await shot(page, '01-uploading');
// Save is blocked while transferring
const primary = page.getByRole('button', { name: /^Save draft$/ });
check('Save is disabled during a transfer', await primary.isDisabled());
await page.getByText('Processing video').waitFor({ timeout: 15000 });
check('reaches processing state', true);
await page.getByText('Ready', { exact: true }).first().waitFor({ timeout: 20000 });
check('reaches ready state', true);
await shot(page, '02-form-ready');

// ---- 3. unverified + Publish now => dialog with explicit choices ----
await page.getByRole('radio', { name: 'Publish now' }).click();
await page.getByRole('button', { name: /^Publish$/ }).click();
const dlg = page.getByRole('dialog');
await dlg.getByRole('heading', { name: /Verify your identity to publish|verification wasn't approved/i }).waitFor();
check('403 opens the explanatory publish dialog', true);
await shot(page, '03-blocked-dialog');
check('dialog offers Save as draft', await dlg.getByRole('button', { name: 'Save as draft' }).isVisible());
check('dialog offers publish-after-verification', await dlg.getByRole('button', { name: /Verify later, publish when approved/ }).isVisible());

// choose "verify later, publish when approved"
await dlg.getByRole('button', { name: /Verify later, publish when approved/ }).click();
await page.waitForURL(/\/content\/cnt_/);
await page.getByText('Set to publish automatically').first().waitFor();
check('intent recorded; details page shows auto-publish notice', true);
const detailsUrl = page.url();
await shot(page, '04-details-with-intent');
check('details shows "No video file is stored" notice', await page.getByText('No video file is stored in this demo').isVisible());
check('item is still a Draft (not published)', await page.getByText('Draft', { exact: true }).first().isVisible());
check('blockers list shows verification', await page.getByText(/Verify your identity to publish content/).isVisible());

// ---- 4. wizard + refresh survival ----
await page.goto(`${BASE}/verification`);
await page.getByRole('heading', { name: 'Your details' }).waitFor();
await page.getByLabel('Full legal name').fill('Sam Rivera');
await page.getByLabel('Date of birth').fill('1992-05-14');
await page.getByLabel('Country', { exact: true }).first().selectOption('US');
await page.getByLabel('Street address').fill('12 Pine Street');
await page.getByLabel('City').fill('Austin');
await page.getByLabel('Postal code').fill('73301');
await shot(page, '05-wizard-step1');
await page.getByRole('button', { name: /Continue/ }).click();
await page.getByRole('heading', { name: 'ID document' }).waitFor();
await page.getByLabel('Passport').check();
await page.locator('input[type=file]').setInputFiles('e2e/fixtures/passport.jpg');
await page.getByText('Simulated: not uploaded or stored').waitFor();

// refresh in the middle
await page.reload();
await page.getByRole('heading', { name: 'ID document' }).waitFor();
check('refresh keeps the step (ID document)', true);
check('refresh keeps the chosen document', await page.getByText('passport.jpg').isVisible());
await page.getByRole('button', { name: /Back/ }).click();
check('refresh kept personal details', (await page.getByLabel('Full legal name').inputValue()) === 'Sam Rivera');
await page.getByRole('button', { name: /Continue/ }).click();
await page.getByRole('button', { name: /Continue/ }).click();
await page.getByRole('heading', { name: 'Identity check' }).waitFor();
check('cannot skip the identity check', await page.getByRole('button', { name: /Continue/ }).isDisabled());
await page.getByRole('button', { name: /Start identity check/ }).click();
await page.getByText('Identity check complete').waitFor({ timeout: 10000 });
await shot(page, '06-wizard-step3');
await page.getByRole('button', { name: /Continue/ }).click();
await page.getByRole('heading', { name: 'Review & submit' }).waitFor();
check('Submit disabled until confirmed', await page.getByRole('button', { name: 'Submit for review' }).isDisabled());
await page.getByLabel(/I confirm these details/).check();
await shot(page, '07-wizard-review');
await page.getByRole('button', { name: 'Submit for review' }).click();
await page.getByRole('heading', { name: 'Your verification is in review' }).waitFor();
check('submission => pending_review (not verified)', true);
await shot(page, '08-pending');
check('demo reviewer controls visible in demo mode', await page.getByRole('heading', { name: /act as the reviewer/ }).isVisible());

// ---- 5. approval publishes ONLY the item with intent ----
await page.getByRole('button', { name: 'Approve' }).click();
await page.getByRole('heading', { name: "You're verified" }).waitFor();
check('approve => verified', true);
await page.goto(detailsUrl);
await page.getByText('Published', { exact: true }).first().waitFor({ timeout: 10000 });
check('the item with intent is now Published', true);
await shot(page, '09-published-details');

// other seeded drafts must NOT have been published by approval
const res = await page.evaluate(async () => (await fetch('/api/content?pageSize=50')).json());
const pub = res.items.filter((c) => c.status === 'published').map((c) => c.title);
check('approval did NOT publish other drafts', pub.length === 1 && pub[0].startsWith('E2E'), JSON.stringify(pub));

// ---- 6. interruption + resume ----
await page.evaluate(() => fetch('/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'fail-next-upload', enabled: true }) }));
await page.goto(`${BASE}/content/new`);
await page.locator('input[type=file][accept*="video"]').setInputFiles('e2e/fixtures/clip.mp4');
await page.getByText(/Connection lost/).waitFor({ timeout: 15000 });
check('injected interruption shows error feedback', true);
await shot(page, '10-interrupted');
await page.getByRole('button', { name: 'Resume upload' }).click();
await page.getByText('Processing video').waitFor({ timeout: 15000 });
check('resume continues to processing (no second drop)', true);

// ---- 7. pause / resume ----
await page.goto(`${BASE}/content/new`);
await page.locator('input[type=file][accept*="video"]').setInputFiles('e2e/fixtures/clip.mp4');
await page.waitForFunction(() => Number(document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')) >= 10);
await page.getByRole('button', { name: 'Pause' }).click();
const v1 = await page.getByRole('progressbar').getAttribute('aria-valuenow');
await page.waitForTimeout(1200);
const v2 = await page.getByRole('progressbar').getAttribute('aria-valuenow');
check('pause freezes progress mid-transfer (>0)', v1 === v2 && Number(v1) >= 10, `${v1} -> ${v2}`);
await page.getByRole('button', { name: 'Resume' }).click();
await page.getByText('Processing video').waitFor({ timeout: 15000 });
check('resume after pause completes', true);

// ---- 8. validation: bad file + empty publish ----
await page.goto(`${BASE}/content/new`);
await page.locator('input[type=file][accept*="video"]').setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') });
check('non-video file rejected client-side', await page.getByText(/Unsupported format/).isVisible());
await page.getByRole('radio', { name: 'Publish now' }).click();
await page.getByRole('button', { name: /^Publish$/ }).click();
check('publish with empty form shows field errors', await page.getByText(/Title must be at least 3/).isVisible());
await shot(page, '11-validation');

console.log('\nconsole errors:', consoleErrors.length ? consoleErrors : 'none');
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
