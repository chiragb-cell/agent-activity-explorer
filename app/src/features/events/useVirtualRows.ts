// Hand-built list virtualization (the brief rules out libraries for this stretch goal).
//
// Only the rows near the viewport are in the DOM; two spacer rows stand in for the rest,
// so 50,000 loaded events cost the same to render and scroll as 50. The arithmetic lives
// in virtualWindow.ts; this hook feeds it real measurements.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { computeWindow, EMPTY_WINDOW, scrollTopToReveal, type RowWindow } from './virtualWindow'

/** Close to the real height (2.25rem + border), so the first frame is nearly right. */
const ESTIMATED_ROW_HEIGHT = 37
/** ~10 rows each side: enough that a fast flick doesn't reveal blank space. */
const OVERSCAN = 10

interface Options {
  count: number
  scrollerRef: RefObject<HTMLElement | null>
  /** The sticky table header; rows start below it. */
  headerRef: RefObject<HTMLElement | null>
}

export function useVirtualRows({ count, scrollerRef, headerRef }: Options) {
  // Geometry lives in a ref: it changes with every scroll event, and only a change in
  // *which rows are rendered* should cause a React render.
  const geometry = useRef({ rowHeight: ESTIMATED_ROW_HEIGHT, offset: 0, viewportHeight: 0 })
  const countRef = useRef(count)
  const [rows, setRows] = useState<RowWindow>(EMPTY_WINDOW)

  const update = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const { rowHeight, offset, viewportHeight } = geometry.current
    const next = computeWindow({
      count: countRef.current,
      rowHeight,
      offset,
      // Before the first measurement, assume a tall screen rather than render nothing.
      viewportHeight: viewportHeight || scroller.clientHeight || 1000,
      scrollTop: scroller.scrollTop,
      overscan: OVERSCAN,
    })
    setRows((previous) =>
      previous.start === next.start &&
      previous.end === next.end &&
      previous.padTop === next.padTop &&
      previous.padBottom === next.padBottom
        ? previous
        : next,
    )
  }, [scrollerRef])

  // More rows loaded (or a new filter): recompute before the browser paints.
  useLayoutEffect(() => {
    countRef.current = count
    update()
  }, [count, update])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    // Scroll events already arrive at most once per frame, so no extra throttling: the
    // window is recomputed for the very frame being drawn. Passive: we never block scrolling.
    scroller.addEventListener('scroll', update, { passive: true })
    const resizes = new ResizeObserver(() => {
      geometry.current.viewportHeight = scroller.clientHeight
      geometry.current.offset = headerRef.current?.offsetHeight ?? 0
      update()
    })
    resizes.observe(scroller)
    if (headerRef.current) resizes.observe(headerRef.current)
    return () => {
      scroller.removeEventListener('scroll', update)
      resizes.disconnect()
    }
  }, [scrollerRef, headerRef, update])

  // Rows are measured, not assumed: zoom, font size and breakpoints change their height.
  // Pass this as the `ref` of any rendered row; the observer re-measures when it changes.
  const rowObserver = useRef<ResizeObserver | null>(null)
  const measureRow = useCallback(
    (row: HTMLTableRowElement | null) => {
      rowObserver.current?.disconnect()
      if (!row) return
      rowObserver.current = new ResizeObserver(([entry]) => {
        const height = entry?.borderBoxSize[0]?.blockSize ?? row.offsetHeight
        if (height > 0 && Math.abs(height - geometry.current.rowHeight) > 0.5) {
          geometry.current.rowHeight = height
          update()
        }
      })
      rowObserver.current.observe(row)
    },
    [update],
  )
  useEffect(() => () => rowObserver.current?.disconnect(), [])

  /** Scrolls just enough to show row `index` (used by keyboard navigation). */
  const scrollToIndex = useCallback(
    (index: number) => {
      const scroller = scrollerRef.current
      if (!scroller) return
      const target = scrollTopToReveal(index, {
        ...geometry.current,
        scrollTop: scroller.scrollTop,
        viewportHeight: geometry.current.viewportHeight || scroller.clientHeight,
      })
      if (target !== null) scroller.scrollTop = target
      update()
    },
    [scrollerRef, update],
  )

  /** How many rows fit on screen, for PageUp/PageDown (one fewer, to keep context). */
  const pageSize = useCallback(() => {
    const { rowHeight, offset, viewportHeight } = geometry.current
    const height = viewportHeight || scrollerRef.current?.clientHeight || 0
    return Math.max(1, Math.floor((height - offset) / rowHeight) - 1)
  }, [scrollerRef])

  return { ...rows, measureRow, scrollToIndex, pageSize }
}
