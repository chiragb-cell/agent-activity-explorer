// The event list: a semantic <table> (screen readers get real rows and column headers),
// a single scroll container, and a footer that loads the next page.

import { memo, useEffect, useRef, type MouseEvent, type RefObject } from 'react'
import type { EventSummary } from '../../api/schemas'
import { Button } from '../../components/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { cx } from '../../lib/cx'
import { format } from '../../lib/format'
import { statusLabel } from '../../lib/status'
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
}: EventTableProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  // One delegated handler makes the whole row clickable. Mouse convenience only: the
  // link in each row's first cell is the keyboard and screen-reader path.
  function handleBodyClick(event: MouseEvent<HTMLTableSectionElement>) {
    if (event.defaultPrevented || event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('a, button, input')) return
    // Don't hijack a click that ends a text selection (e.g. copying an agent name).
    if (window.getSelection()?.toString()) return
    const id = target.closest<HTMLTableRowElement>('tr[data-event-id]')?.dataset.eventId
    if (!id) return
    if (event.metaKey || event.ctrlKey) window.open(hrefFor(id), '_blank', 'noopener')
    else onOpen(id)
  }

  return (
    <div ref={scrollerRef} className={styles.scroller}>
      <table
        className={cx(styles.table, stale && styles.stale)}
        aria-rowcount={total === undefined ? -1 : total + 1}
        aria-busy={stale || undefined}
        inert={stale}
      >
        <caption className="visually-hidden">Agent tool calls, newest first</caption>
        <colgroup>
          <col className={styles.colTime} />
          <col className={styles.colAgent} />
          <col className={styles.colTool} />
          <col className={styles.colStatus} />
          <col className={styles.colLatency} />
          <col className={cx(styles.colArgs, styles.args)} />
        </colgroup>
        <thead>
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
        <tbody onClick={handleBodyClick}>
          {events.map((event, index) => (
            <EventRow
              key={event.id}
              event={event}
              rowIndex={index + 2}
              selected={event.id === selectedId}
              href={hrefFor(event.id)}
              onOpen={onOpen}
            />
          ))}
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

interface EventRowProps {
  event: EventSummary
  /** 1-based and counting the header row, as aria-rowindex expects. */
  rowIndex: number
  selected: boolean
  href: string
  onOpen: (id: string) => void
}

// Memoised: selecting a row re-renders only the old and new selection, not every row.
const EventRow = memo(function EventRow({
  event,
  rowIndex,
  selected,
  href,
  onOpen,
}: EventRowProps) {
  return (
    <tr
      aria-rowindex={rowIndex}
      className={cx(styles.row, selected && styles.selected)}
      data-event-id={event.id}
    >
      <td>
        <a
          href={href}
          className={styles.rowLink}
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
