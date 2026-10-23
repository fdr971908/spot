import { defineConfig, devices } from '@playwright/test';

// Run with the app already started (`npm run dev`) or let Playwright start it.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  use: {
    actionTimeout: 15_000,
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    ...devices['iPhone 13'],
    browserName: 'chromium',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: 'npm run dev', url: 'http://localhost:3000/api/health', reuseExistingServer: true, timeout: 120_000 },
});
