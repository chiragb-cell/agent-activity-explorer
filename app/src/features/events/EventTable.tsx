// The event list: a semantic <table> (screen readers get real rows and column headers)
// in its own scroll container, virtualized by hand so any number of loaded events stays
// fast, with keyboard navigation and a footer that loads the next page.

import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
  type RefObject,
} from 'react'
import type { EventSummary } from '../../api/schemas'
import { Button } from '../../components/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { cx } from '../../lib/cx'
import { format } from '../../lib/format'
import { statusLabel } from '../../lib/status'
import { useVirtualRows } from './useVirtualRows'
import styles from './EventTable.module.css'

export type FooterState =
  | { kind: 'none' }
  | { kind: 'more' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'end'; count: number }

interface EventTableProps {
  events: EventSummary[]
  total: number | undefined
  selectedId: string | null
  hrefFor: (id: string) => string
  onOpen: (id: string) => void
  footer: FooterState
  onLoadMore: () => void
  onRetryLoadMore: () => void
  /** Previous results stay visible while new ones load: dim them and keep them out of reach. */
  stale: boolean
  /** Placeholder rows while the first page loads (only after a short delay, so fast loads don't flash). */
  skeleton: boolean
  /** The list's scroll container, owned by the page so it can reset the position. */
  scrollerRef: RefObject<HTMLDivElement | null>
}

export function EventTable({
  events,
  total,
  selectedId,
  hrefFor,
  onOpen,
  footer,
  onLoadMore,
  onRetryLoadMore,
  stale,
  skeleton,
  scrollerRef,
}: EventTableProps) {
  const headerRef = useRef<HTMLTableSectionElement>(null)
  const bodyRef = useRef<HTMLTableSectionElement>(null)
  const { start, end, padTop, padBottom, measureRow, scrollToIndex, pageSize } = useVirtualRows({
    count: events.length,
    scrollerRef,
    headerRef,
  })

  // Keyboard: the whole list is one tab stop (roving tabindex). Only the "active" row's
  // link is tabbable; arrow keys move it. A new result set starts again from the top.
  const listKey = events[0]?.id
  const [cursor, setCursor] = useState({ index: 0, listKey })
  if (cursor.listKey !== listKey) setCursor({ index: 0, listKey })
  const activeIndex = Math.min(cursor.index, Math.max(0, events.length - 1))
  const pendingFocus = useRef<number | null>(null)
  const lastFocused = useRef<HTMLElement | null>(null)

  function moveTo(index: number) {
    if (events.length === 0) return
    const next = Math.min(Math.max(index, 0), events.length - 1)
    setCursor({ index: next, listKey })
    pendingFocus.current = next
    scrollToIndex(next)
  }

  // Focus the row the keyboard moved to, once it is rendered. preventScroll: scrollToIndex
  // already placed it below the sticky header, which focus() on its own wouldn't respect.
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return
    const link = bodyRef.current?.querySelector<HTMLElement>(
      `tr[data-index="${pendingFocus.current}"] a`,
    )
    if (!link) return
    link.focus({ preventScroll: true })
    pendingFocus.current = null
  })

  // If the focused row scrolls out of the window it is removed from the DOM, and focus
  // would fall to <body> (browsers don't reliably fire blur on removal, so check directly).
  // Keep focus in the list instead; the arrow keys then resume from the same row.
  // Runs after every render: it is two property reads, and any render can drop rows.
  useLayoutEffect(() => {
    const focused = lastFocused.current
    if (focused && !focused.isConnected && document.activeElement === document.body) {
      scrollerRef.current?.focus({ preventScroll: true })
    }
  })

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || stale) return
    const targets: Record<string, number> = {
      ArrowDown: activeIndex + 1,
      j: activeIndex + 1,
      ArrowUp: activeIndex - 1,
      k: activeIndex - 1,
      Home: 0,
      End: events.length - 1,
      PageDown: activeIndex + pageSize(),
      PageUp: activeIndex - pageSize(),
    }
    const next = targets[event.key]
    if (next === undefined) return
    event.preventDefault() // otherwise the scroller would also scroll natively
    moveTo(next)
  }

  // One delegated handler makes the whole row clickable. Mouse convenience only: the
  // link in each row's first cell is the keyboard and screen-reader path.
  function handleBodyClick(event: MouseEvent<HTMLTableSectionElement>) {
    if (event.defaultPrevented || event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('a, button, input')) return
    // Don't hijack a click that ends a text selection (e.g. copying an agent name).
    if (window.getSelection()?.toString()) return
    const row = target.closest<HTMLTableRowElement>('tr[data-event-id]')
    const id = row?.dataset.eventId
    if (!row || !id) return
    setCursor({ index: Number(row.dataset.index), listKey })
    if (event.metaKey || event.ctrlKey) window.open(hrefFor(id), '_blank', 'noopener')
    else onOpen(id)
  }

  return (
    // The scroller is the list's keyboard surface: arrow keys from any row (or from the
    // scroller itself, after a focus rescue) move between rows.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={scrollerRef}
      className={styles.scroller}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onFocus={(event) => {
        lastFocused.current = event.target
        // Keep the roving cursor where focus actually is (Tab, click or programmatic).
        const row = event.target.closest<HTMLTableRowElement>('tr[data-index]')
        if (row) setCursor({ index: Number(row.dataset.index), listKey })
      }}
    >
      <table
        className={cx(styles.table, stale && styles.stale)}
        aria-rowcount={total === undefined ? -1 : total + 1}
        aria-busy={stale || skeleton || undefined}
        inert={stale}
      >
        <caption className="visually-hidden">
          Agent tool calls, newest first. Use the arrow keys to move between rows.
        </caption>
        <colgroup>
          <col className={styles.colTime} />
          <col className={styles.colAgent} />
          <col className={styles.colTool} />
          <col className={styles.colStatus} />
          <col className={styles.colLatency} />
          <col className={cx(styles.colArgs, styles.args)} />
        </colgroup>
        <thead ref={headerRef}>
          <tr aria-rowindex={1}>
            <th scope="col">
              Time <span className={styles.timeZone}>({format.timeZoneLabel})</span>
            </th>
            <th scope="col">Agent</th>
            <th scope="col">Tool</th>
            <th scope="col">Status</th>
            <th scope="col" className={styles.numeric}>
              Latency
            </th>
            <th scope="col" className={styles.args}>
              Arguments
            </th>
          </tr>
        </thead>
        {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- each row's link is the keyboard path; this is a mouse shortcut */}
        <tbody ref={bodyRef} onClick={handleBodyClick}>
          {skeleton ? <SkeletonRows /> : null}
          {padTop > 0 ? <Spacer height={padTop} /> : null}
          {events.slice(start, end).map((event, offset) => {
            const index = start + offset
            return (
              <EventRow
                key={event.id}
                event={event}
                index={index}
                active={index === activeIndex}
                selected={event.id === selectedId}
                href={hrefFor(event.id)}
                onOpen={onOpen}
                rowRef={offset === 0 ? measureRow : undefined}
              />
            )
          })}
          {padBottom > 0 ? <Spacer height={padBottom} /> : null}
        </tbody>
      </table>
      <ListFooter
        state={footer}
        scrollerRef={scrollerRef}
        onLoadMore={onLoadMore}
        onRetry={onRetryLoadMore}
      />
    </div>
  )
}

/** Stands in for the rows that aren't rendered, so the scrollbar reflects the whole list. */
function Spacer({ height }: { height: number }) {
  return (
    <tr className={styles.spacer} style={{ height }} aria-hidden="true">
      <td colSpan={6} />
    </tr>
  )
}

interface EventRowProps {
  event: EventSummary
  /** Position in the loaded list (0-based). */
  index: number
  /** The keyboard cursor: the one row whose link is in the tab order. */
  active: boolean
  selected: boolean
  href: string
  onOpen: (id: string) => void
  /** Set on the first rendered row so the virtualizer can measure the real row height. */
  rowRef?: Ref<HTMLTableRowElement>
}

// Memoised: moving the cursor or the selection re-renders two rows, not the window.
const EventRow = memo(function EventRow({
  event,
  index,
  active,
  selected,
  href,
  onOpen,
  rowRef,
}: EventRowProps) {
  return (
    <tr
      ref={rowRef}
      // 1-based and counting the header row, as aria-rowindex expects.
      aria-rowindex={index + 2}
      className={cx(styles.row, selected && styles.selected)}
      data-event-id={event.id}
      data-index={index}
    >
      <td>
        <a
          href={href}
          className={styles.rowLink}
          tabIndex={active ? 0 : -1}
          aria-current={selected ? 'true' : undefined}
          data-event-link={event.id}
          onClick={(e) => {
            // Plain clicks open the panel in place; modified clicks keep the browser's
            // own behaviour (new tab or window) because the href is the real URL.
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            e.preventDefault()
            onOpen(event.id)
          }}
        >
          <time dateTime={event.timestamp}>{format.eventTime(event.timestamp)}</time>
          <span className="visually-hidden">
            , {event.tool} by {event.agent}, {statusLabel(event.status)}
          </span>
        </a>
      </td>
      <td title={event.agent}>{event.agent}</td>
      <td title={event.tool} className={styles.mono}>
        {event.tool}
      </td>
      <td>
        <StatusBadge status={event.status} />
      </td>
      <td className={styles.numeric}>{format.latency(event.latencyMs)}</td>
      <td className={cx(styles.args, styles.mono, styles.muted)} title={event.argsPreview}>
        {event.argsPreview}
      </td>
    </tr>
  )
})

/** Grey bars with varied widths, so the placeholder reads as "rows" rather than a grid. */
function SkeletonRows() {
  return Array.from({ length: 14 }, (_, row) => (
    <tr key={row} className={styles.skeletonRow} aria-hidden="true">
      {[70, 62, 66, 48, 40, 88].map((base, column) => (
        <td
          key={column}
          className={column === 4 ? styles.numeric : column === 5 ? styles.args : undefined}
        >
          <span
            className={styles.skeletonBar}
            style={{ width: `${base - ((row * 7 + column * 13) % 22)}%` }}
          />
        </td>
      ))}
    </tr>
  ))
}

interface ListFooterProps {
  state: FooterState
  scrollerRef: RefObject<HTMLDivElement | null>
  onLoadMore: () => void
  onRetry: () => void
}

function ListFooter({ state, scrollerRef, onLoadMore, onRetry }: ListFooterProps) {
  const ref = useRef<HTMLDivElement>(null)
  const wantsMore = state.kind === 'more'

  // Start loading the next page well before the user reaches the end. The observer is
  // recreated after each page (wantsMore flips), and a fresh observer reports its
  // current state, so a footer that is still in view keeps loading.
  useEffect(() => {
    const element = ref.current
    if (!wantsMore || !element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore()
      },
      { root: scrollerRef.current, rootMargin: '0px 0px 1200px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [wantsMore, onLoadMore, scrollerRef])

  if (state.kind === 'none') return null
  return (
    <div ref={ref} className={styles.footer}>
      {state.kind === 'more' ? (
        <Button size="sm" onClick={onLoadMore}>
          Load more events
        </Button>
      ) : null}
      {state.kind === 'loading' ? (
        <span className={styles.footerNote}>
          <span className={styles.spinner} aria-hidden="true" />
          Loading more events…
        </span>
      ) : null}
      {state.kind === 'error' ? (
        <>
          <span className={styles.footerError}>Couldn’t load more events. {state.message}</span>
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        </>
      ) : null}
      {state.kind === 'end' ? (
        <span className={styles.footerNote}>
          That’s everything: {format.plural(state.count, 'event')}.
        </span>
      ) : null}
    </div>
  )
}
