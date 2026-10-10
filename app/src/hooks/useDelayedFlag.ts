import { useEffect, useState } from 'react'

/**
 * True once `active` has stayed true for `delayMs`, and false the moment it turns false.
 *
 * Used to stage loading feedback: a fast response shows nothing at all (no skeleton
 * flash), a normal one shows a skeleton, and a slow one adds "still loading…".
 */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(false)
  const [previousActive, setPreviousActive] = useState(active)

  // Each change of `active` starts a new episode, so forget the old one. Adjusting state
  // during render (React's documented pattern) avoids an extra render from an effect.
  if (active !== previousActive) {
    setPreviousActive(active)
    setElapsed(false)
  }

  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setElapsed(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])

  return active && elapsed
}
