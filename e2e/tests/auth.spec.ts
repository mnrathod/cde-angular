import { test, expect } from '@playwright/test';
import { login, logout } from '../helpers/auth';

test.describe('Authentication', () => {

  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('form button[type="submit"]')).toBeVisible();
    await expect(page.getByLabel(/username/i)).toBeVisible();
  });

  test('successful login redirects to home', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: 'Select a project' })).toBeVisible();
  });

  test('invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/username/i).fill('wronguser');
    await page.getByLabel(/password/i).fill('wrongpass');
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByText(/invalid username or password/i)).toBeVisible();
  });

  test('sign out navigates to login', async ({ page }) => {
    await login(page);
    await logout(page);
    await expect(page).toHaveURL('/login');
  });

  test('protected route redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/compare');
    await expect(page).toHaveURL(/\/login/);
  });

  test('sign in button is disabled while loading', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/username/i).fill('admin');
    await page.getByLabel(/password/i).fill('admin123');
    // Selected by role, not by label: the label becomes "Signing in..." the
    // moment it is clicked, so a name-based locator stops matching exactly
    // when the assertion needs it.
    const btn = page.locator('form button[type="submit"]');
    await btn.click();
    // During request the button should be disabled
    await expect(btn).toBeDisabled();
  });
});
