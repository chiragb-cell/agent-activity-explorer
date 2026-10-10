import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDelayedFlag } from './useDelayedFlag'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useDelayedFlag', () => {
  it('turns on only after the delay', () => {
    const { result } = renderHook(() => useDelayedFlag(true, 200))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(199))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(true)
  })

  it('never turns on if the work finishes first', () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 200), {
      initialProps: { active: true },
    })
    act(() => vi.advanceTimersByTime(150))
    rerender({ active: false })
    act(() => vi.advanceTimersByTime(500))
    expect(result.current).toBe(false)
  })

  it('turns off in the same render that the work finishes', () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 200), {
      initialProps: { active: true },
    })
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe(true)
    rerender({ active: false })
    expect(result.current).toBe(false)
  })

  it('starts the delay over when work begins again', () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 200), {
      initialProps: { active: true },
    })
    act(() => vi.advanceTimersByTime(200))
    rerender({ active: false })
    rerender({ active: true })
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe(true)
  })
})
