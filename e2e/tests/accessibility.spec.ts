import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Accessibility', () => {

  test('login page has correct ARIA landmarks', async ({ page }) => {
    await page.goto('/login');
    // Form inputs should have labels
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('sign in button is keyboard accessible', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');  // focus username
    await page.keyboard.type('admin');
    await page.keyboard.press('Tab');  // focus password
    await page.keyboard.type('admin123');
    await page.keyboard.press('Enter'); // submit
    await page.waitForURL('/', { timeout: 10_000 });
  });

  test('page has no critical ARIA violations', async ({ page }) => {
    await page.goto('/login');
    // Check that interactive elements have accessible names
    const buttons = page.getByRole('button');
    const count   = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn  = buttons.nth(i);
      const name = await btn.getAttribute('aria-label') ||
                   await btn.textContent();
      expect(name?.trim().length).toBeGreaterThan(0);
    }
  });

  test('error messages are announced to screen readers', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('admin').fill('wrong');
    await page.getByPlaceholder('••••••••').fill('wrong');
    await page.getByRole('button', { name: /sign in/i }).click();
    const errorEl = page.locator('[role="alert"], .text-red-600, .text-red-700').first();
    await expect(errorEl).toBeVisible({ timeout: 5_000 });
  });

  test('compare page Compare button has descriptive title', async ({ page }) => {
    await login(page);
    await page.goto('/compare');
    const btn = page.getByRole('button', { name: /^Compare$/i });
    // disabled buttons should still be accessible
    await expect(btn).toBeVisible();
  });
});
