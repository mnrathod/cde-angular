import { test, expect } from '@playwright/test';

/**
 * The demo host, in a real browser, across a real origin boundary.
 *
 * What this covers that the unit tests cannot: that `host.js` loads as a
 * module, that its element ids match `index.html`, that the iframe gets the
 * URL it should, and that messages survive an actual `postMessage` between
 * two ports. The protocol agreement itself is checked in
 * `src/app/features/embed/protocol-conversation.spec.ts`, against the real
 * viewer rather than the stub framed here.
 *
 * Run:  npx playwright test --config demo/e2e/playwright.config.mjs
 */

const STUB_ORIGIN = 'http://localhost:4402';

/** Fail loudly on a console error — a demo with one is not a working demo. */
test.beforeEach(async ({ page }) => {
  page.on('console', (message) => {
    if (message.type() === 'error') throw new Error(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => { throw error; });
});

test('loads and lists the sample documents', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Host application');
  for (const name of ['sample-drawing.pdf', 'sample-specification.docx', 'sample-model.ifc']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
});

test('serves each sample document to the viewer origin, and only that origin', async ({ page }) => {
  await page.goto('/');

  for (const file of ['sample-drawing.pdf', 'sample-specification.docx', 'sample-model.ifc']) {
    const response = await page.request.get(`/files/${file}`);
    expect(response.status()).toBe(200);
    // The viewer is a different origin, so the document fetch needs CORS —
    // named, not wildcarded.
    expect(response.headers()['access-control-allow-origin']).toBe(STUB_ORIGIN);
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  }

  // The host's own page is not readable cross-origin, only the files are.
  const hostPage = await page.request.get('/index.html');
  expect(hostPage.headers()['access-control-allow-origin']).toBeUndefined();
});

test('refuses to serve outside its directory', async ({ page }) => {
  // A demo server is the thing most likely to be copied into something real.
  const response = await page.request.get('/../server.mjs', { maxRedirects: 0 });
  expect(response.status()).not.toBe(200);
});

test('frames the viewer with parentOrigin and completes the handshake', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'sample-drawing.pdf' }).click();

  const frame = page.locator('#viewer-frame');
  const source = new URL(await frame.getAttribute('src'));
  expect(source.origin).toBe(STUB_ORIGIN);
  expect(source.pathname).toBe('/embed');
  // §2: addressing. The host tells the viewer who to talk to; frame-ancestors
  // is what decides who may frame it.
  expect(source.searchParams.get('parentOrigin')).toBe('http://localhost:4401');

  const log = page.locator('#log');
  await expect(log).toContainText('viewer sent viewer.ready');
  await expect(log).toContainText('host sent host.init');
  await expect(log).toContainText('viewer sent viewer.loaded');

  await expect(page.frameLocator('#viewer-frame').locator('#doc'))
    .toHaveText('sample-drawing.pdf');
});

test('stores markup the viewer emits, stamping its own session as the author', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Display name').fill('B. Reviewer');
  await page.getByRole('button', { name: 'sample-drawing.pdf' }).click();
  await expect(page.locator('#log')).toContainText('viewer.loaded');

  await page.frameLocator('#viewer-frame').getByRole('button', { name: 'Emit markup' }).click();

  const row = page.locator('#markup-rows tr').first();
  await expect(row).toContainText('CLOUD');
  await expect(row).toContainText('Drawn by the stub');
  // §6.2: the viewer sends no author; this name came from the host's own form.
  await expect(row).toContainText('B. Reviewer');
});

test('refuses an operation whose capability it granted', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/document:sign/).check();
  await page.getByRole('button', { name: 'sample-drawing.pdf' }).click();
  await expect(page.locator('#log')).toContainText('viewer.loaded');

  await page.frameLocator('#viewer-frame')
    .getByRole('button', { name: 'Request document.sign' }).click();

  // §6.1: capabilities decide what renders, the host decides what happens.
  await expect(page.locator('#log')).toContainText('host sent host.operationResult');
  await expect(page.locator('#log')).toContainText('refused');
  await expect(page.frameLocator('#viewer-frame').locator('#state'))
    .toHaveText('operation refused');
});

test('drives the viewer with host.command', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'sample-drawing.pdf' }).click();
  await expect(page.locator('#log')).toContainText('viewer.loaded');

  await page.getByRole('button', { name: 'Page 3' }).click();
  await expect(page.frameLocator('#viewer-frame').locator('#state'))
    .toHaveText('command goToPage');
});

test('is operable from the keyboard alone', async ({ page }) => {
  // §1A.2 — the manual pass is still required, but a trap or an unreachable
  // control is the kind of failure worth catching every run.
  await page.goto('/');

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /Skip to the viewer/ })).toBeFocused();

  const reached = new Set();
  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => {
      const active = document.activeElement;
      return active ? `${active.tagName}:${active.id || active.textContent?.trim().slice(0, 24)}` : '';
    });
    reached.add(label);
  }

  expect([...reached].some((entry) => entry.includes('sample-drawing.pdf'))).toBe(true);
  expect([...reached].some((entry) => entry.includes('display-name'))).toBe(true);
  expect([...reached].some((entry) => entry.includes('apply-identity'))).toBe(true);
  // A focus trap shows up as the same element every time.
  expect(reached.size).toBeGreaterThan(8);
});
