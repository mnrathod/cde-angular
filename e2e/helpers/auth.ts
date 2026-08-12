import { Page, expect } from '@playwright/test';

/**
 * Sign in and wait until the application has actually navigated away.
 *
 * The wait is for "any page that is not /login" rather than a specific path.
 * It used to wait for '/' exactly, which the application has not redirected to
 * for some time — it lands on /projects — so every test that signed in failed
 * on a ten second timeout rather than on whatever it was testing.
 */
export async function login(page: Page, username = 'admin', password = 'admin123') {
  await page.goto('/login');

  // fill() replaces whatever is there, so this works whether or not the
  // development build arrived with the form prefilled.
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.locator('form button[type="submit"]').click();

  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.waitForURL(/\/login/);
  await expect(page.getByPlaceholder('admin')).toBeVisible();
}
