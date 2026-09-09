import { defineConfig, devices } from '@playwright/test';

/**
 * A standalone Playwright project for the demo host.
 *
 * Separate from the repository's root config on purpose: that one starts
 * `ng serve`, and the demo host is plain HTML with no build. Keeping them
 * apart means these tests run in a checkout that has never built the Angular
 * application — which is the situation someone evaluating the integration is
 * in.
 */
const preinstalledChromium = process.env['PLAYWRIGHT_CHROMIUM_PATH'];

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4401',
    trace: 'on-first-retry',
    launchOptions: preinstalledChromium ? { executablePath: preinstalledChromium } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node demo/server.mjs',
      url: 'http://localhost:4401',
      cwd: '../..',
      reuseExistingServer: !process.env['CI'],
      env: { VIEWER_ORIGIN: 'http://localhost:4402' },
    },
    {
      command: 'node demo/e2e/stub-server.mjs',
      url: 'http://localhost:4402',
      cwd: '../..',
      reuseExistingServer: !process.env['CI'],
    },
  ],
});
