import { defineConfig, devices } from '@playwright/test';

/**
 * E2E test configuration for Playwright.
 *
 * Requires a running local dev server (pnpm dev) and local Supabase (pnpm db:start).
 * Configure credentials via environment variables — see .env.example for the full list.
 *
 * Run: pnpm test:e2e
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
