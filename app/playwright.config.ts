import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against the production build (vite preview), not the dev server:
// React StrictMode's dev-only double mount sends every request twice, which would make
// request-count assertions meaningless and isn't what users get.
//
// The API is replaced per test with a deterministic fake (e2e/mockApi.ts), so the suite
// doesn't depend on the mock API's deliberate flakiness. e2e/real-api.spec.ts is the one
// smoke test against the real binary; it runs only with E2E_REAL_API=1.

const PORT = 4173

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Locally, reuse the installed Chrome instead of downloading a browser.
        ...(process.env.CI ? {} : { channel: 'chrome' }),
      },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
