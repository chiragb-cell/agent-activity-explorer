import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedCallback } from './useDebouncedCallback'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

type Callback = (value: string) => void

describe('useDebouncedCallback', () => {
  it('calls once, with the last arguments, after the delay', () => {
    const spy = vi.fn<Callback>()
    const { result } = renderHook(() => useDebouncedCallback(spy, 300))
    result.current.run('r')
    result.current.run('re')
    result.current.run('refund')
    vi.advanceTimersByTime(299)
    expect(spy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(spy).toHaveBeenCalledExactlyOnceWith('refund')
  })

  it('flush runs a pending call immediately; cancel drops it', () => {
    const spy = vi.fn<Callback>()
    const { result } = renderHook(() => useDebouncedCallback(spy, 300))
    result.current.run('now')
    result.current.flush()
    expect(spy).toHaveBeenCalledExactlyOnceWith('now')

    result.current.run('never')
    result.current.cancel()
    vi.advanceTimersByTime(1000)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('calls the latest callback without changing identity between renders', () => {
    const first = vi.fn<Callback>()
    const second = vi.fn<Callback>()
    const { result, rerender } = renderHook(({ cb }) => useDebouncedCallback(cb, 300), {
      initialProps: { cb: first },
    })
    const identity = result.current
    rerender({ cb: second })
    expect(result.current).toBe(identity)
    result.current.run('x')
    vi.advanceTimersByTime(300)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('x')
  })

  it('never fires after unmount', () => {
    const spy = vi.fn<Callback>()
    const { result, unmount } = renderHook(() => useDebouncedCallback(spy, 300))
    result.current.run('late')
    unmount()
    vi.advanceTimersByTime(1000)
    expect(spy).not.toHaveBeenCalled()
  })
})
