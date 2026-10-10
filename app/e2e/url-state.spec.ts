// Requirement 2 of the brief: the view lives in the URL, so reload, Back/Forward and
// shared links all work. This needs a real browser: jsdom's history isn't the
// browser's (for one thing, it shares a single session history across tests).

import { expect, test } from './fixtures'

test('filters survive a reload, and Back/Forward step through them', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('1,000 events · 200 loaded')).toBeVisible()

  await page.getByRole('radio', { name: 'OK' }).check()
  await expect(page).toHaveURL('/?status=ok')
  await page.getByRole('button', { name: 'Agents' }).click()
  await page.getByRole('checkbox', { name: 'code-reviewer' }).check()
  await expect(page).toHaveURL('/?agent=code-reviewer&status=ok')
  await expect(page.getByText('250 matching · 200 loaded')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('radio', { name: 'OK' })).toBeChecked()
  await expect(page.getByRole('list', { name: 'Active filters' })).toContainText('code-reviewer')
  await expect(page.getByText('250 matching · 200 loaded')).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL('/?status=ok')
  await expect(page.getByRole('list', { name: 'Active filters' })).not.toContainText('Agent')
  await page.goBack()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('radio', { name: 'All' })).toBeChecked()
  await page.goForward()
  await expect(page).toHaveURL('/?status=ok')
  await expect(page.getByRole('radio', { name: 'OK' })).toBeChecked()
})

test('one Back undoes a whole burst of typing, pauses included', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('1,000 events · 200 loaded')).toBeVisible()
  const search = page.getByRole('searchbox', { name: 'Search events' })

  await search.pressSequentially('sql', { delay: 60 })
  await expect(page).toHaveURL('/?q=sql')
  // Longer than the 300 ms debounce, so the URL has already been written once.
  await page.waitForTimeout(600)
  await search.pressSequentially('.query', { delay: 60 })
  await expect(page).toHaveURL('/?q=sql.query')
  await expect(page.getByText('250 matching · 200 loaded')).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL('/')
  await expect(search).toHaveValue('')
  await expect(page.getByText('1,000 events · 200 loaded')).toBeVisible()

  await page.goForward()
  await expect(page).toHaveURL('/?q=sql.query')
  await expect(search).toHaveValue('sql.query')
})

test('a hand-edited URL is tidied without adding a history entry', async ({ page }) => {
  await page.goto(
    '/?status=nonsense&agent=data-analyst&agent=code-reviewer&agent=data-analyst&q=+sql+',
  )
  await expect(page).toHaveURL('/?q=sql&agent=code-reviewer&agent=data-analyst')
  expect(await page.evaluate(() => history.length)).toBe(2) // about:blank, then this page
})

test('opening events: one entry for the panel, switching rows replaces it, Back closes it', async ({
  page,
}) => {
  await page.goto('/')
  const links = page.getByRole('table').getByRole('link')

  await links.nth(0).click()
  await expect(page).toHaveURL('/?event=evt_00000')
  await expect(page.getByRole('complementary', { name: 'http.request' })).toBeVisible()
  // Side by side on a wide screen, not a modal: the list stays usable.
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await links.nth(1).click()
  await expect(page).toHaveURL('/?event=evt_00001')
  await expect(page.getByRole('complementary', { name: 'sql.query' })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('complementary')).toHaveCount(0)
})

test('a deep link opens its event, and closing it stays on the page', async ({ page }) => {
  await page.goto('/?event=evt_00002')
  const panel = page.getByRole('complementary', { name: 'email.send' })
  await expect(panel).toBeVisible()
  await expect(panel.getByText('secrets.leak')).toBeVisible()
  await expect(panel.getByRole('heading', { level: 2 })).toBeFocused()

  // Nothing in this tab's history opened the panel, so closing must not go Back (that
  // would leave the app); it replaces the entry instead.
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL('/')
  await expect(panel).toHaveCount(0)
  await expect(page.getByText('1,000 events · 200 loaded')).toBeVisible()
})

test('a link to a missing event says so after a single request', async ({ page, api }) => {
  await page.goto('/?event=evt_gone')
  await expect(page.getByText('Event not found', { exact: true })).toBeVisible()
  await page.waitForTimeout(500)
  expect(api.requests.details).toBe(1) // a 404 is an answer, not a failure to retry
})
