import { test, expect } from '@playwright/test';
import { login, logout } from '../helpers/auth';

test.describe('Authentication', () => {

  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Sign In')).toBeVisible();
    await expect(page.getByPlaceholder('admin')).toBeVisible();
  });

  test('successful login redirects to home', async ({ page }) => {
    await login(page);
    await expect(page.getByText('Select a project')).toBeVisible();
  });

  test('invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('admin').fill('wronguser');
    await page.getByPlaceholder('••••••••').fill('wrongpass');
    await page.getByRole('button', { name: /sign in/i }).click();
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
    await page.getByPlaceholder('admin').fill('admin');
    await page.getByPlaceholder('••••••••').fill('admin123');
    const btn = page.getByRole('button', { name: /sign in/i });
    await btn.click();
    // During request the button should be disabled
    await expect(btn).toBeDisabled();
  });
});
