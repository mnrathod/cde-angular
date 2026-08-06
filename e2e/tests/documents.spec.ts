import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';
import * as path from 'path';

test.describe('Projects', () => {

  test.beforeEach(async ({ page }) => { await login(page); });

  test('sidebar shows project list', async ({ page }) => {
    await expect(page.locator('aside')).toBeVisible();
    await expect(page.getByText('Projects')).toBeVisible();
  });

  test('selecting a project loads its documents', async ({ page }) => {
    const project = page.locator('aside .proj-item').first();
    if (await project.count() > 0) {
      await project.click();
      // Doc grid or empty state should appear
      await expect(
        page.locator('.doc-card').first()
          .or(page.getByText(/no documents yet/i))
      ).toBeVisible({ timeout: 8_000 });
    }
  });

  test('Compare button appears after selecting project', async ({ page }) => {
    const project = page.locator('aside .proj-item').first();
    if (await project.count() > 0) {
      await project.click();
      await expect(page.getByRole('button', { name: /compare/i })).toBeVisible();
    }
  });

  test('Upload button appears after selecting project', async ({ page }) => {
    const project = page.locator('aside .proj-item').first();
    if (await project.count() > 0) {
      await project.click();
      await expect(page.getByRole('button', { name: /upload/i })).toBeVisible();
    }
  });
});

test.describe('Upload modal', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    const project = page.locator('aside .proj-item').first();
    if (await project.count()) await project.click();
  });

  test('Upload modal opens and closes', async ({ page }) => {
    const uploadBtn = page.getByRole('button', { name: /upload/i });
    if (await uploadBtn.count() === 0) test.skip();

    await uploadBtn.click();
    await expect(page.getByText('Upload Document')).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByText('Upload Document')).not.toBeVisible();
  });

  test('document name auto-fills from file name', async ({ page }) => {
    const uploadBtn = page.getByRole('button', { name: /upload/i });
    if (await uploadBtn.count() === 0) test.skip();

    await uploadBtn.click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'floor-plan-rev-b.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PDF content')
    });
    await expect(page.locator('input[placeholder]').first()).toHaveValue('floor-plan-rev-b');
  });
});

test.describe('Compare', () => {

  test.beforeEach(async ({ page }) => { await login(page); });

  test('Compare page loads', async ({ page }) => {
    await page.goto('/compare');
    await expect(page.getByText('Compare Documents')).toBeVisible();
  });

  test('File 1 and File 2 slots are visible', async ({ page }) => {
    await page.goto('/compare');
    await expect(page.getByText('File 1')).toBeVisible();
    await expect(page.getByText('File 2')).toBeVisible();
  });

  test('Compare button is disabled without file selection', async ({ page }) => {
    await page.goto('/compare');
    const compareBtn = page.getByRole('button', { name: /^Compare$/i });
    await expect(compareBtn).toBeDisabled();
  });

  test('AI Summary section is visible', async ({ page }) => {
    await page.goto('/compare');
    await expect(page.getByText('AI Summary')).toBeVisible();
  });
});
