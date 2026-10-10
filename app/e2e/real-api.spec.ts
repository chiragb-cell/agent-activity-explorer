// One smoke test against the real mock API binary, to catch drift between the fake in
// mockApi.ts and the real thing. Opt-in, because the real API fails at random by design:
//
//   npm run api                     (in one terminal)
//   E2E_REAL_API=1 npm run e2e      (in another)

import { expect, test } from '@playwright/test'

test.skip(!process.env.E2E_REAL_API, 'Set E2E_REAL_API=1 and start the API with `npm run api`')

test('loads real events and opens one', async ({ page }) => {
  await page.goto('/')
  const firstLink = page.getByRole('table').getByRole('link').first()
  // Generous: real responses take up to ~1.5 s, and a random 500 adds a retry.
  await expect(firstLink).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/\d events/).first()).toBeVisible()

  await firstLink.click()
  const panel = page.getByRole('complementary')
  await expect(panel.getByRole('heading', { name: 'Arguments' })).toBeVisible({ timeout: 20_000 })
  await expect(panel.getByRole('heading', { name: 'Result' })).toBeVisible()
})
