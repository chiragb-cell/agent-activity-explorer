// Automated accessibility checks (axe-core, WCAG 2.2 A and AA rules) on every screen
// state, in both colour schemes. Automation catches roughly a third of real issues
// (contrast, names, roles, structure); keyboard paths are covered by list.spec.ts.

import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  // Rule ids and selectors only: readable in the test report, and enough to find the node.
  const found = violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  )
  expect(found).toEqual([])
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    // Settled colours only: a half-finished fade-in would make contrast checks flaky.
    test.use({ colorScheme, reducedMotion: 'reduce' })

    test('the list, an open event and the agent picker', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByText('1,000 events · 200 loaded')).toBeVisible()
      await expectNoViolations(page)

      await page.getByRole('table').getByRole('link').nth(2).click()
      await expect(page.getByText('secrets.leak')).toBeVisible()
      await expectNoViolations(page)

      await page.getByRole('button', { name: 'Agents' }).click()
      await page.getByRole('checkbox', { name: 'data-analyst' }).check()
      await expectNoViolations(page)
    })

    test('the empty, error and not-found states', async ({ page, api }) => {
      api.set({ firstPage: 'empty' })
      await page.goto('/?q=nothing')
      await expect(page.getByText('No events match these filters', { exact: true })).toBeVisible()
      await expectNoViolations(page)

      api.set({ firstPage: 'error' })
      await page.goto('/?event=evt_gone')
      await expect(page.getByText('Couldn’t load events', { exact: true })).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText('Event not found', { exact: true })).toBeVisible()
      await expectNoViolations(page)
    })

    test('the tablet drawer', async ({ page }) => {
      await page.setViewportSize({ width: 820, height: 1180 })
      await page.goto('/?event=evt_00002')
      await expect(page.getByRole('dialog', { name: 'Event details' })).toBeVisible()
      await expect(page.getByText('secrets.leak')).toBeVisible()
      await expectNoViolations(page)
    })
  })
}
