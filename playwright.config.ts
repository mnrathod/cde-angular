import { defineConfig, devices } from '@playwright/test';

/**
 * Use a browser that is already on the machine instead of one Playwright
 * downloads.
 *
 * Playwright resolves its browser by a build number pinned to the installed
 * @playwright/test version, so an image that ships a different build fails
 * every test at launch with "Executable doesn't exist" — a message about the
 * environment that reads like a suite-wide breakage. Setting
 * PLAYWRIGHT_CHROMIUM_PATH points it at the browser that is there. Unset, the
 * default download path is used and nothing changes.
 */
const preinstalledChromium = process.env['PLAYWRIGHT_CHROMIUM_PATH'];
const launchOptions = preinstalledChromium
  ? { executablePath: preinstalledChromium }
  : {};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL:   'http://localhost:4200',
    trace:     'on-first-retry',
    screenshot: 'only-on-failure',
    video:     'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions } },
    { name: 'mobile',   use: { ...devices['Pixel 5'],        launchOptions } },
  ],
  webServer: {
    command: 'ng serve --proxy-config proxy.conf.json',
    url:     'http://localhost:4200',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
