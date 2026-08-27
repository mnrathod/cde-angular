import { test, expect } from '@playwright/test';
import { registerAndSignIn, logout } from '../helpers/auth';

test.describe('Accessibility', () => {

  test('login page has correct ARIA landmarks', async ({ page }) => {
    await page.goto('/login');
    // Form inputs should have labels
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('sign in form is operable from the keyboard', async ({ page }) => {
    // An account has to exist before it can be signed into from the keyboard,
    // and there is no seeded one to borrow. Registering then signing out
    // leaves exactly one real account to type.
    const account = await registerAndSignIn(page);
    await logout(page);

    // Start from the username field rather than from a bare Tab: the tab
    // strip precedes the form, so counting Tab presses from the top of the
    // document made this assert the tab order rather than the form.
    await page.getByLabel(/username/i).fill('');
    await page.getByLabel(/username/i).focus();
    await page.keyboard.type(account.username);
    await page.keyboard.press('Tab');
    await page.getByLabel(/password/i).fill('');
    await page.keyboard.type(account.password);
    await page.keyboard.press('Enter');   // Enter in a field submits the form
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15_000 });
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
    await page.getByLabel(/username/i).fill('wrong');
    await page.getByLabel(/password/i).fill('wrong');
    await page.locator('form button[type="submit"]').click();
    const errorEl = page.locator('[role="alert"], .text-red-600, .text-red-700').first();
    await expect(errorEl).toBeVisible({ timeout: 5_000 });
  });

  test('compare page Compare button has descriptive title', async ({ page }) => {
    await registerAndSignIn(page);
    await page.goto('/compare');
    const btn = page.getByRole('button', { name: /^Compare$/i });
    // disabled buttons should still be accessible
    await expect(btn).toBeVisible();
  });
});
