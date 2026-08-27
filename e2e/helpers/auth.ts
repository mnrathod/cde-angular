import { Page, expect } from '@playwright/test';

/** Long enough for the server's 12-character minimum, and not a real secret. */
const TEST_PASSWORD = 'e2e-correct-horse-battery-staple';

export interface TestAccount {
  username: string;
  email: string;
  password: string;
}

/**
 * Create an account, which signs the browser in and gives it an organisation
 * of its own.
 *
 * <p>These tests used to sign in as the seeded `admin`. That account no longer
 * exists: a deployment starts empty unless it is explicitly told to seed one
 * and given a password to use. Registering is not a workaround for that — it
 * is the path a real first user takes, and it means each test run works in an
 * organisation containing only what that run put there, so tests cannot see
 * each other's data or depend on fixture state left behind by an earlier run.
 */
export async function registerAndSignIn(page: Page): Promise<TestAccount> {
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const account: TestAccount = {
    username: `e2e-${unique}`,
    email: `e2e-${unique}@example.test`,
    password: TEST_PASSWORD,
  };

  await page.goto('/login');
  await page.getByRole('tab', { name: /register/i }).click();

  await page.getByLabel(/username/i).fill(account.username);
  await page.getByLabel(/email/i).fill(account.email);
  await page.getByLabel(/^password/i).fill(account.password);
  await page.locator('form button[type="submit"]').click();

  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  return account;
}

/**
 * Sign in as an account that already exists.
 *
 * The wait is for "any page that is not /login" rather than a specific path.
 * It used to wait for '/' exactly, which the application has not redirected to
 * for some time — it lands on /projects — so every test that signed in failed
 * on a ten second timeout rather than on whatever it was testing.
 */
export async function login(page: Page, account: TestAccount) {
  await page.goto('/login');

  await page.getByLabel(/username/i).fill(account.username);
  await page.getByLabel(/password/i).fill(account.password);
  await page.locator('form button[type="submit"]').click();

  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.waitForURL(/\/login/);
  // Identified by its label rather than by a placeholder. The username input
  // used to carry placeholder="admin", naming the seeded account on every
  // login page; the label is what the field actually has and what a screen
  // reader announces.
  await expect(page.getByLabel(/username/i)).toBeVisible();
}
