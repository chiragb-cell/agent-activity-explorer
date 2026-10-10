import { useCallback, useEffect, useMemo, useRef } from 'react'

export interface Debounced<Args extends unknown[]> {
  /** Schedules a call with these arguments, replacing any pending one. */
  run(...args: Args): void
  /** Drops a pending call. */
  cancel(): void
  /** Runs a pending call now (e.g. on Enter) instead of waiting for the delay. */
  flush(): void
}

/**
 * Debounces `callback` by `delayMs`. The returned object is stable across renders and
 * always calls the *latest* `callback`, so callers don't need to memoise it. A pending
 * call is dropped on unmount rather than firing into an unmounted component.
 *
 * Mutable state lives in refs that are only touched inside the callbacks, never during
 * render, which keeps this safe under concurrent rendering and the React Compiler rules.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
): Debounced<Args> {
  const latest = useRef(callback)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef<Args | null>(null)

  useEffect(() => {
    latest.current = callback
  })

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const args = pending.current
    pending.current = null
    if (args) latest.current(...args)
  }, [])

  const cancel = useCallback(() => {
    clearTimeout(timer.current)
    pending.current = null
  }, [])

  const run = useCallback(
    (...args: Args) => {
      pending.current = args
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, delayMs)
    },
    [delayMs, flush],
  )

  useEffect(() => cancel, [cancel])

  return useMemo(() => ({ run, cancel, flush }), [run, cancel, flush])
}
