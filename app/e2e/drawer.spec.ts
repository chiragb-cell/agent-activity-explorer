// Tablet widths (768–1023 px): the detail panel is a modal <dialog> drawer instead of a
// column, because a column would squeeze the table to unreadable widths.

import { expect, test } from './fixtures'

for (const viewport of [
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
]) {
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport })

    test('the panel opens as a modal drawer; Escape closes it once and focus returns', async ({
      page,
    }) => {
      await page.goto('/')
      const link = page.getByRole('table').getByRole('link').nth(2)
      await link.click()

      const drawer = page.getByRole('dialog', { name: 'Event details' })
      await expect(drawer).toBeVisible()
      // Modal: the browser makes the rest of the page inert and traps the focus order.
      expect(await drawer.evaluate((dialog) => dialog.matches(':modal'))).toBe(true)
      await expect(drawer.getByRole('heading', { level: 2 })).toBeFocused()
      await expect(drawer.getByText('secrets.leak')).toBeVisible()

      // One Escape must close it exactly once: two handlers would go Back twice and
      // leave the app.
      await page.keyboard.press('Escape')
      await expect(page).toHaveURL('/')
      await expect(drawer).toHaveCount(0)
      await expect(link).toBeFocused()
      await expect(page.getByText('1,000 events · 200 loaded')).toBeVisible()
    })

    test('clicking the backdrop or the close button closes the drawer', async ({ page }) => {
      await page.goto('/')
      const drawer = page.getByRole('dialog', { name: 'Event details' })
      const links = page.getByRole('table').getByRole('link')

      await links.nth(1).click()
      await expect(drawer).toBeVisible()
      await page.mouse.click(20, viewport.height / 2) // left of the right-pinned drawer
      await expect(drawer).toHaveCount(0)
      await expect(page).toHaveURL('/')

      await links.nth(1).click()
      await drawer.getByRole('button', { name: 'Close details' }).click()
      await expect(drawer).toHaveCount(0)
      await expect(page).toHaveURL('/')
    })
  })
}

test('a deep link on a tablet opens the drawer, and closing it stays on the page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.goto('/?event=evt_00002')
  const drawer = page.getByRole('dialog', { name: 'Event details' })
  await expect(drawer).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page).toHaveURL('/')
  await expect(drawer).toHaveCount(0)
  await expect(page.getByText('1,000 events · 200 loaded')).toBeVisible()
})
