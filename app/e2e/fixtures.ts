// Every end-to-end test gets the fake API installed before its first navigation. Tests
// that need a failure call `api.set(...)` before `page.goto`, and read `api.requests`
// to count what the app actually sent.

import { test as base } from '@playwright/test'
import { fakeApi, type FakeApi } from './mockApi'

export const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, use) => {
      await use(await fakeApi(page))
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
