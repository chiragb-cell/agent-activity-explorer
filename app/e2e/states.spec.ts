// Requirement 3 of the brief: every state of a slow, flaky API is handled and explained.
// The fake API makes each failure happen on cue; the timings are the app's real ones
// (backoff of roughly 0.4 s, 0.8 s and 1.6 s between attempts).

import { expect, test } from './fixtures'

test('a server error is retried, and the list loads without the user doing anything', async ({
  page,
  api,
}) => {
  api.set({ failFirst: 3 })
  await page.goto('/')
  await expect(page.getByText(/Retrying \(attempt [234] of 4\)/)).toBeVisible()
  await expect(page.getByText('1,000 events · 200 loaded')).toBeVisible({ timeout: 10_000 })
  expect(api.requests.firstPage).toBe(4)
})

test('when the server keeps failing it says so plainly, and Try again recovers', async ({
  page,
  api,
}) => {
  api.set({ firstPage: 'error' })
  await page.goto('/')
  await expect(page.getByText('Couldn’t load events', { exact: true })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByText('The server ran into a problem (error 500).')).toBeVisible()
  expect(api.requests.firstPage).toBe(4) // the first attempt and three retries, then it stops

  api.set({ firstPage: 'ok' })
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('1,000 events · 200 loaded')).toBeVisible()
})

test('an unreachable server gets its own message', async ({ page, api }) => {
  api.set({ firstPage: 'refused' })
  await page.goto('/')
  await expect(page.getByText('Couldn’t load events', { exact: true })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByText(/couldn't connect to the server/)).toBeVisible()
})

test('a slow response gets a "still loading" note, then the rows', async ({ page, api }) => {
  api.set({ firstResponseDelayMs: 3500 })
  await page.goto('/')
  await expect(page.getByRole('table')).toHaveAttribute('aria-busy', 'true') // skeleton rows
  const slowNote = page.getByText('Still loading. The server is responding slowly.')
  await expect(slowNote).toBeVisible()
  await expect(page.getByText('1,000 events · 200 loaded')).toBeVisible({ timeout: 10_000 })
  await expect(slowNote).toHaveCount(0)
})

test('"no events match" and "no events yet" are different messages', async ({ page, api }) => {
  api.set({ firstPage: 'empty' })
  await page.goto('/?status=error')
  await expect(page.getByText('No events match these filters', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByText('No events yet', { exact: true })).toBeVisible()
})

test('a failed next page keeps the loaded rows and waits for the user', async ({ page, api }) => {
  api.set({ nextPages: 'error' })
  await page.goto('/')
  await expect(page.getByText('1,000 events · 200 loaded')).toBeVisible()
  // Reaching the end of the list starts the next page on its own (the footer's
  // "Load more events" button is the keyboard path to the same thing).
  const scroller = page.getByRole('table').locator('xpath=..')
  await scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))

  await expect(page.getByText(/Couldn’t load more events/)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('1,000 events · 200 loaded')).toBeVisible()
  expect(api.requests.nextPages).toBe(4)
  // No loop: with the footer still on screen, nothing more is sent until asked.
  await page.waitForTimeout(1500)
  expect(api.requests.nextPages).toBe(4)

  api.set({ nextPages: 'ok' })
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('1,000 events · 400 loaded')).toBeVisible()
})

test('changing filters keeps the old rows on screen, dimmed and out of reach, until the new ones arrive', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByText('1,000 events · 200 loaded')).toBeVisible()

  // Slow down only the next list request, so the in-between state is observable.
  await page.route(
    (url) => url.pathname === '/events' && url.searchParams.get('status') === 'error',
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.fallback()
    },
  )
  await page.getByRole('radio', { name: 'Error' }).check()
  const table = page.getByRole('table')
  await expect(page.getByText('Updating results…')).toBeVisible()
  await expect(table).toHaveAttribute('inert', '')
  await expect(page.locator('tr[data-event-id="evt_00000"]')).toBeAttached() // old rows kept

  await expect(page.getByText('250 matching · 200 loaded')).toBeVisible()
  await expect(table).not.toHaveAttribute('inert')
  await expect(page.locator('tr[data-event-id="evt_00003"]')).toBeAttached()
})
