import { test, expect } from '@playwright/test';

/**
 * The published API documentation, checked as a page rather than as a
 * configuration value.
 *
 * Whether the "try it" console is disabled cannot be read back from
 * springdoc's own swagger-config: it serialises the setting as the string
 * `"[]"` whether it is written as a list or bound from an environment
 * variable, so the config value is the same either way and proves nothing.
 * What matters is what renders, which is what these assert.
 */
const DOCS = 'http://localhost:8080/api/docs';

test.describe('API documentation', () => {

  test('renders every documented operation, grouped by tag', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));

    await page.goto(DOCS, { waitUntil: 'networkidle' });
    await page.waitForSelector('.opblock');

    // 63 endpoints across 15 tags today — 52 across 14 before the Common Data
    // Environment gained an HTTP surface. Asserted as a floor rather than an
    // equality so adding one does not fail this, but silently losing a
    // controller from the document does. The floor is raised when endpoints
    // are added; leaving it at the old number would keep the test green while
    // it stopped covering eleven of them.
    expect(await page.locator('.opblock').count()).toBeGreaterThanOrEqual(63);
    expect(await page.locator('.opblock-tag').count()).toBeGreaterThanOrEqual(15);
    expect(pageErrors).toEqual([]);
  });

  test('lists tags in the order they are declared, not alphabetically', async ({ page }) => {
    await page.goto(DOCS, { waitUntil: 'networkidle' });
    await page.waitForSelector('.opblock-tag');

    // Authentication first, because it is what a reader needs before any
    // other endpoint is usable. Alphabetical ordering would put Annotations
    // there instead.
    const firstTag = await page.locator('.opblock-tag').first().innerText();
    expect(firstTag.split('\n')[0].trim()).toBe('Authentication');
  });

  test('offers no "try it out" console', async ({ page }) => {
    // The page documents; it is not a request console. Enabling the console
    // means real requests with real credentials from a page that also
    // enumerates every endpoint.
    await page.goto(DOCS, { waitUntil: 'networkidle' });
    await page.waitForSelector('.opblock');

    await expect(page.locator('button.try-out__btn')).toHaveCount(0);
  });

  test('serves the specification itself without a credential', async ({ request }) => {
    // A client generator, a linter and a reviewer all read this, and none of
    // them has a token.
    const spec = await request.get('http://localhost:8080/api/openapi');
    expect(spec.status()).toBe(200);

    const document = await spec.json();
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.components.schemas)).toContain('ProblemDetail');
  });
});
