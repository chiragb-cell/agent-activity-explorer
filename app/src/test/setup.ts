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

// jsdom has no layout engine, so it lacks these APIs entirely. Minimal stand-ins keep
// components runnable here; their real behaviour is covered by the Playwright suite.
// (Pure tests run in the node environment, where there is no window at all.)
if (typeof window !== 'undefined') installBrowserStandIns()

function installBrowserStandIns() {
  class InertObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  if (typeof window.ResizeObserver !== 'function') {
    window.ResizeObserver = InertObserver as unknown as typeof ResizeObserver
  }
  if (typeof window.IntersectionObserver !== 'function') {
    window.IntersectionObserver = InertObserver as unknown as typeof IntersectionObserver
  }
  if (typeof Element.prototype.scrollTo !== 'function') {
    Element.prototype.scrollTo = () => {}
  }
  if (typeof window.matchMedia !== 'function') {
    // A desktop-sized viewport: wide enough for the side-by-side detail panel.
    window.matchMedia = (query: string) =>
      ({
        matches: /min-width:\s*1024px/.test(query),
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      }) as MediaQueryList
  }
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true
    }
  }
}
