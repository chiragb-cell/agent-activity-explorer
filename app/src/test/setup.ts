import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server'

// MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`, and its default only warns.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))

afterEach(() => {
  // Vitest doesn't expose test globals here, so Testing Library can't register its own
  // auto-cleanup; unmount explicitly so DOM state never leaks between tests.
  cleanup()
  server.resetHandlers()
})

afterAll(() => server.close())
