// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { computeWindow, EMPTY_WINDOW, scrollTopToReveal, type WindowInput } from './virtualWindow'

// 36 px rows under a 32 px header, in a 360 px viewport: 10 rows visible at a time.
const base: WindowInput = {
  count: 1000,
  rowHeight: 36,
  scrollTop: 0,
  viewportHeight: 360,
  offset: 32,
  overscan: 5,
}

/** Rendered rows plus both spacers must always add up to the full list height. */
function expectConsistent(input: WindowInput) {
  const w = computeWindow(input)
  expect(w.padTop + (w.end - w.start) * input.rowHeight + w.padBottom).toBe(
    input.count * input.rowHeight,
  )
  return w
}

describe('computeWindow', () => {
  it('renders nothing for an empty list or an unmeasured row height', () => {
    expect(computeWindow({ ...base, count: 0 })).toEqual(EMPTY_WINDOW)
    expect(computeWindow({ ...base, rowHeight: 0 })).toEqual(EMPTY_WINDOW)
  })

  it('renders the single row of a one-row list', () => {
    expect(expectConsistent({ ...base, count: 1 })).toEqual({
      start: 0,
      end: 1,
      padTop: 0,
      padBottom: 0,
    })
  })

  it('renders the visible rows plus overscan below at the top', () => {
    const w = expectConsistent(base)
    expect(w.start).toBe(0)
    expect(w.end).toBe(10 + 5) // (360 - 32) / 36 rounds up to 10, plus overscan
  })

  it('keeps a constant-size window in the middle, with spacers either side', () => {
    const w = expectConsistent({ ...base, scrollTop: 32 + 500 * 36 })
    expect(w.start).toBe(495)
    expect(w.end).toBe(515)
    expect(w.padTop).toBe(495 * 36)
  })

  it('treats a negative scrollTop (elastic overscroll) as the top', () => {
    expect(computeWindow({ ...base, scrollTop: -120 })).toEqual(computeWindow(base))
  })

  it('shows the last rows when scrollTop is past the end', () => {
    const w = expectConsistent({ ...base, count: 50, scrollTop: 1_000_000 })
    expect(w.end).toBe(50)
    expect(w.start).toBe(44) // the last row index (49) minus overscan
    expect(w.padBottom).toBe(0)
  })

  it('stays consistent across many scroll positions', () => {
    for (let scrollTop = -50; scrollTop < 1000 * 36; scrollTop += 777) {
      expectConsistent({ ...base, scrollTop })
    }
  })
})

describe('scrollTopToReveal', () => {
  const geometry = { rowHeight: 36, offset: 32, scrollTop: 0, viewportHeight: 360 }

  it('does nothing for a row that is already fully visible', () => {
    expect(scrollTopToReveal(3, geometry)).toBeNull()
  })

  it('scrolls down just enough to show a row below the viewport', () => {
    // Row 20 ends at 32 + 21 * 36 = 788 px, so the viewport must end there.
    expect(scrollTopToReveal(20, geometry)).toBe(788 - 360)
  })

  it('scrolls up so a row above sits right under the sticky header', () => {
    expect(scrollTopToReveal(10, { ...geometry, scrollTop: 2000 })).toBe(10 * 36)
  })
})
