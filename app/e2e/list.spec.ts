// The list at scale: paging by scrolling, virtualization keeping the DOM small, and the
// keyboard path through rows that come and go as the window moves.

import { expect, test } from './fixtures'

test('scrolling loads every page, rows repeated across pages show once, the DOM stays small', async ({
  page,
  api,
}) => {
  // Each page repeats the last 5 rows of the previous one, as offset paging does when
  // new events arrive mid-scroll.
  api.set({ overlap: 5 })
  await page.goto('/')
  await expect(page.getByText('1,000 events · 200 loaded')).toBeVisible()

  const scroller = page.getByRole('table').locator('xpath=..')
  const toBottom = () =>
    scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
  const end = page.getByText(/That’s everything/)
  await expect(async () => {
    await toBottom()
    await expect(end).toBeAttached({ timeout: 500 })
  }).toPass({ timeout: 30_000 })

  await expect(end).toHaveText('That’s everything: 1,000 events.')
  await expect(page.getByText('1,000 events', { exact: true })).toBeVisible()
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '1001')
  expect(api.requests.nextPages).toBe(5)

  // The last page arrived below the fold; scroll down to it.
  await toBottom()
  await expect(end).toBeInViewport()
  const rendered = page.locator('tbody tr[data-event-id]')
  await expect(rendered.last()).toHaveAttribute('data-event-id', 'evt_00999')
  expect(await rendered.count()).toBeLessThan(80) // of 1,000 loaded
})

test('arrow keys move through rows past the viewport without losing focus', async ({ page }) => {
  await page.goto('/')
  const links = page.getByRole('table').getByRole('link')
  const focusedRow = page.locator('tr:has(a:focus)')

  await links.first().focus()
  for (let step = 0; step < 60; step++) await page.keyboard.press('ArrowDown')
  await expect(focusedRow).toHaveAttribute('data-event-id', 'evt_00060')
  await expect(focusedRow).toBeInViewport()
  // Row 0 is no longer rendered: virtualization really is at work.
  await expect(page.locator('tr[data-event-id="evt_00000"]')).toHaveCount(0)

  await page.keyboard.press('End')
  await expect(focusedRow).toHaveAttribute('data-event-id', 'evt_00199')
  await page.keyboard.press('Home')
  await expect(focusedRow).toHaveAttribute('data-event-id', 'evt_00000')
  await expect(focusedRow).toBeInViewport()

  // Only the active row is in the tab order, so Tab leaves the list in one step.
  await expect(page.locator('tbody a[tabindex="0"]')).toHaveCount(1)
})

test('focus stays in the list when the focused row scrolls out of the DOM', async ({ page }) => {
  await page.goto('/')
  const scroller = page.getByRole('table').locator('xpath=..')
  await page.getByRole('table').getByRole('link').nth(3).focus()

  await scroller.evaluate((element) => element.scrollTo({ top: 5000 }))
  await expect(page.locator('tr[data-event-id="evt_00003"]')).toHaveCount(0)
  // Not <body>: the scroller caught it, so the keyboard still works.
  await expect(scroller).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(page.locator('tr:has(a:focus)')).toHaveAttribute('data-event-id', 'evt_00004')
})

test('Enter opens the focused row, Escape closes it and focus goes back to the row', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('table').getByRole('link').first().focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL('/?event=evt_00002')
  const panel = page.getByRole('complementary', { name: 'email.send' })
  await expect(panel.getByRole('heading', { level: 2 })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(page).toHaveURL('/')
  await expect(panel).toHaveCount(0)
  await expect(page.locator('[data-event-link="evt_00002"]')).toBeFocused()
})

test('"/" jumps to search, and Escape there clears it before anything else', async ({ page }) => {
  await page.goto('/?q=sql&event=evt_00001')
  await expect(page.getByRole('complementary', { name: 'sql.query' })).toBeVisible()

  await page.getByRole('table').getByRole('link').first().focus()
  await page.keyboard.press('/')
  const search = page.getByRole('searchbox', { name: 'Search events' })
  await expect(search).toBeFocused()

  // The first Escape belongs to the search box; the panel stays open.
  await page.keyboard.press('Escape')
  await expect(search).toHaveValue('')
  await expect(page).toHaveURL('/?event=evt_00001')
  await expect(page.getByRole('complementary')).toBeVisible()
})
