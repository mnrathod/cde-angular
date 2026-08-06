import { Page } from '@playwright/test';

export async function login(page: Page, username = 'admin', password = 'admin123') {
  await page.goto('/login');
  await page.getByPlaceholder('admin').fill(username);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/', { timeout: 10_000 });
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.waitForURL('/login');
}
