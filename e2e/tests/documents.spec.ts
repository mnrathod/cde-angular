import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';
import * as path from 'path';

/**
 * Every project test here selects a project first, and does so unconditionally.
 *
 * These used to read `if (await project.count() > 0)` against a class that no
 * longer exists in the template. `count()` does not wait, so it returned 0, the
 * body never ran, and Playwright reported a pass with no assertions in it — a
 * green suite that had stopped testing the upload flow entirely. Selecting is
 * now a helper that fails if there is nothing to select.
 */
async function selectFirstProject(page: import('@playwright/test').Page) {
  const project = page.getByTestId('project-item').first();
  await expect(project).toBeVisible({ timeout: 10_000 });
  await project.click();
  return project;
}

test.describe('Projects', () => {

  test.beforeEach(async ({ page }) => { await login(page); });

  test('sidebar shows project list', async ({ page }) => {
    await expect(page.locator('aside')).toBeVisible();
    await expect(page.getByText('Projects')).toBeVisible();
  });

  test('selecting a project loads its documents', async ({ page }) => {
    await selectFirstProject(page);
    // Either a document grid or the empty state — both mean the project loaded.
    await expect(
      page.getByTestId('document-card').first()
        .or(page.getByText(/no documents yet/i))
    ).toBeVisible({ timeout: 8_000 });
  });

  test('Compare button appears after selecting project', async ({ page }) => {
    await selectFirstProject(page);
    await expect(page.getByRole('button', { name: /compare/i })).toBeVisible();
  });

  test('Upload button appears after selecting project', async ({ page }) => {
    await selectFirstProject(page);
    await expect(page.getByRole('button', { name: /upload/i })).toBeVisible();
  });
});

test.describe('Upload modal', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await selectFirstProject(page);
  });

  test('Upload modal opens and closes', async ({ page }) => {
    const uploadBtn = page.getByRole('button', { name: /upload/i }).first();
    await expect(uploadBtn).toBeVisible();

    await uploadBtn.click();
    await expect(page.getByText('Upload Document')).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).first().click();
    await expect(page.getByText('Upload Document')).not.toBeVisible();
  });

  test('document name auto-fills from file name', async ({ page }) => {
    const uploadBtn = page.getByRole('button', { name: /upload/i }).first();
    await expect(uploadBtn).toBeVisible();

    await uploadBtn.click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'floor-plan-rev-b.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PDF content')
    });
    // By test id, not by "the first input with a placeholder" — that matched a
    // different field entirely, so the assertion was checking the wrong box.
    await expect(page.getByTestId('upload-name')).toHaveValue('floor-plan-rev-b');
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
