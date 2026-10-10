// Which rows of a long list to actually render (windowing), as pure arithmetic so the
// edge cases are unit-tested without a browser. The table renders rows [start, end) and
// two spacer rows whose heights stand in for everything above and below.

export interface WindowInput {
  /** Rows available (loaded so far). */
  count: number
  /** Height of one row in px; all rows share it (single-line cells). */
  rowHeight: number
  /** The scroll container's scrollTop. */
  scrollTop: number
  /** The scroll container's visible height. */
  viewportHeight: number
  /** Distance from the top of the scrolled content to the first row (the table header). */
  offset: number
  /** Extra rows rendered above and below, so fast scrolling doesn't reveal blank space. */
  overscan: number
}

export interface RowWindow {
  start: number
  end: number
  padTop: number
  padBottom: number
}

export const EMPTY_WINDOW: RowWindow = { start: 0, end: 0, padTop: 0, padBottom: 0 }

export function computeWindow(input: WindowInput): RowWindow {
  const { count, rowHeight, viewportHeight, offset, overscan } = input
  if (count <= 0 || rowHeight <= 0) return EMPTY_WINDOW

  // Rubber-band (elastic) scrolling can report a negative scrollTop; treat it as the top.
  // A scrollTop past the end (e.g. the list just got shorter) is clamped by the indexes.
  const scrollTop = Math.max(0, input.scrollTop)
  const firstVisible = clamp(Math.floor((scrollTop - offset) / rowHeight), 0, count - 1)
  const endVisible = clamp(
    Math.ceil((scrollTop + viewportHeight - offset) / rowHeight),
    firstVisible + 1,
    count,
  )

  const start = Math.max(0, firstVisible - overscan)
  const end = Math.min(count, endVisible + overscan)
  return { start, end, padTop: start * rowHeight, padBottom: (count - end) * rowHeight }
}

/** The scrollTop that brings row `index` fully into view below the sticky header, or null if it already is. */
export function scrollTopToReveal(
  index: number,
  { rowHeight, offset, scrollTop, viewportHeight }: Omit<WindowInput, 'count' | 'overscan'>,
): number | null {
  const rowTop = offset + index * rowHeight
  const rowBottom = rowTop + rowHeight
  // The sticky header covers the first `offset` px of the viewport.
  if (rowTop < scrollTop + offset) return Math.max(0, rowTop - offset)
  if (rowBottom > scrollTop + viewportHeight) return rowBottom - viewportHeight
  return null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
