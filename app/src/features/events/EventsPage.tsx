// The explorer screen: reads the view from the URL, loads the matching events and
// renders the list with every state a real user can hit (loading, slow, retrying,
// empty, failed, failed to load more, failed to refresh).

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { explainError } from '../../api/errors'
import { refreshEventList, useEventList } from '../../api/queries'
import { MAX_RETRIES } from '../../api/retry'
import { Button } from '../../components/Button'
import { LiveRegion } from '../../components/LiveRegion'
import { StateMessage } from '../../components/StateMessage'
import { useDelayedFlag } from '../../hooks/useDelayedFlag'
import { format } from '../../lib/format'
import { clearFilters, openEvent, useView } from '../../url/useView'
import { hasActiveFilters, parseView, serializeView, toEventFilters } from '../../url/view'
import { EventTable, type FooterState } from './EventTable'
import styles from './EventsPage.module.css'

/** Skeletons appear only if loading takes longer than this, so fast responses don't flash. */
const SKELETON_DELAY_MS = 150
/** Above the slowest response measured (~1.5 s), so it only shows when something is off. */
const SLOW_AFTER_MS = 2000

export function EventsPage() {
  const view = useView()
  const queryClient = useQueryClient()
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Key everything list-related on the filters only, so opening or switching the detail
  // panel never re-renders every row or refetches the list.
  const filtersSearch = serializeView({ ...view, event: null })
  const filters = useMemo(() => toEventFilters(parseView(filtersSearch)), [filtersSearch])
  const filtered = hasActiveFilters(view)

  const { query, events, total } = useEventList(filters)
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } = query

  // New results start at the top: reset the list's scroll whenever the filters change
  // (by typing, a filter control, or Back/Forward), but not on the first render.
  const scrolledForFilters = useRef(filtersSearch)
  useEffect(() => {
    if (scrolledForFilters.current === filtersSearch) return
    scrolledForFilters.current = filtersSearch
    scrollerRef.current?.scrollTo({ top: 0 })
  }, [filtersSearch])

  const hrefFor = useCallback(
    (id: string) =>
      `${window.location.pathname}${serializeView({ ...parseView(filtersSearch), event: id })}`,
    [filtersSearch],
  )

  // Automatic loading (scrolling near the end) must never fire while something else is
  // in flight, and stops after a failed page until the user explicitly retries.
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetching && !isFetchNextPageError) {
      void fetchNextPage({ cancelRefetch: false })
    }
  }, [hasNextPage, isFetching, isFetchNextPageError, fetchNextPage])
  const retryLoadMore = useCallback(() => void fetchNextPage(), [fetchNextPage])

  const refresh = () => {
    scrollerRef.current?.scrollTo({ top: 0 })
    void refreshEventList(queryClient, filters)
  }

  // "Waiting" = the rows on screen are not the answer to the current filters yet.
  const waiting = query.isPending || query.isPlaceholderData
  const showSkeleton = useDelayedFlag(waiting && events.length === 0, SKELETON_DELAY_MS)
  const slow = useDelayedFlag(waiting && isFetching, SLOW_AFTER_MS)
  const failedOutright = query.isError && events.length === 0 && !query.isPlaceholderData

  let body: ReactNode
  if (failedOutright) {
    const { message, canRetry } = explainError(query.error)
    body = (
      <StateMessage
        title="Couldn’t load events"
        tone="error"
        actions={
          <>
            {canRetry ? (
              <Button variant="primary" onClick={() => void query.refetch()}>
                Try again
              </Button>
            ) : null}
            {filtered ? <Button onClick={clearFilters}>Clear filters</Button> : null}
          </>
        }
      >
        {message}
      </StateMessage>
    )
  } else if (!waiting && events.length === 0) {
    body = filtered ? (
      <StateMessage
        title="No events match these filters"
        actions={<Button onClick={clearFilters}>Clear filters</Button>}
      >
        Try a different search, or remove a filter.
      </StateMessage>
    ) : (
      <StateMessage title="No events yet">
        Tool calls will appear here as your agents run.
      </StateMessage>
    )
  } else {
    body = (
      <EventTable
        events={events}
        total={total}
        selectedId={view.event}
        hrefFor={hrefFor}
        onOpen={openEvent}
        footer={footerState(query, events.length)}
        onLoadMore={loadMore}
        onRetryLoadMore={retryLoadMore}
        stale={query.isPlaceholderData}
        skeleton={showSkeleton}
        scrollerRef={scrollerRef}
      />
    )
  }

  return (
    <section className={styles.list} aria-labelledby="events-heading">
      <div className={styles.listHeader}>
        <h2 id="events-heading" className={styles.listTitle}>
          Events
        </h2>
        <p className={styles.count}>{countText(total, events.length, filtered, waiting)}</p>
        <Activity query={query} slow={slow} />
        <Button
          size="sm"
          variant="ghost"
          className={styles.refresh}
          onClick={refresh}
          disabled={isFetching}
        >
          Refresh
        </Button>
      </div>
      {query.isRefetchError ? (
        <div className={styles.banner} role="alert">
          <span>
            Couldn’t refresh. {explainError(query.error).message} Showing the earlier results.
          </span>
          <Button size="sm" onClick={refresh}>
            Try again
          </Button>
        </div>
      ) : null}
      {body}
      <LiveRegion message={announcement(query, total, events.length, filtered, waiting, slow)} />
    </section>
  )
}

type ListQuery = ReturnType<typeof useEventList>['query']

/** Short, transient progress note next to the count. The most useful message wins. */
function Activity({ query, slow }: { query: ListQuery; slow: boolean }) {
  let text: string | null = null
  if (query.isFetching && query.failureCount > 0) {
    text = `The server returned an error. Retrying (attempt ${query.failureCount + 1} of ${MAX_RETRIES + 1})…`
  } else if (slow) {
    text = 'Still loading. The server is responding slowly.'
  } else if (query.isPlaceholderData && query.isFetching) {
    text = 'Updating results…'
  } else if (query.isRefetching && !query.isFetchingNextPage) {
    text = 'Refreshing…'
  }
  if (!text) return null
  return (
    <p className={styles.activity}>
      <span className={styles.spinner} aria-hidden="true" />
      {text}
    </p>
  )
}

function countText(total: number | undefined, loaded: number, filtered: boolean, waiting: boolean) {
  if (waiting || total === undefined) return ''
  const matched = filtered ? `${format.count(total)} matching` : format.plural(total, 'event')
  return loaded < total ? `${matched} · ${format.count(loaded)} loaded` : matched
}

/** What a screen reader hears. Deliberately stable while pages load, so it isn't chatty. */
function announcement(
  query: ListQuery,
  total: number | undefined,
  loaded: number,
  filtered: boolean,
  waiting: boolean,
  slow: boolean,
) {
  if (query.isError && loaded === 0 && !query.isPlaceholderData) return 'Couldn’t load events.'
  if (waiting)
    return slow ? 'Still loading events. The server is responding slowly.' : 'Loading events…'
  if (loaded === 0) return filtered ? 'No events match these filters.' : 'No events yet.'
  if (total === undefined) return ''
  return filtered
    ? `${format.count(total)} events match these filters.`
    : `${format.plural(total, 'event')}.`
}

function footerState(query: ListQuery, loadedCount: number): FooterState {
  // While a new filter is loading, the rows on screen belong to the old one, so nothing
  // the footer could say about them would be true.
  if (query.isPlaceholderData || loadedCount === 0) return { kind: 'none' }
  if (query.isFetchNextPageError) {
    return { kind: 'error', message: explainError(query.error).message }
  }
  if (query.isFetchingNextPage) return { kind: 'loading' }
  if (query.hasNextPage) return { kind: 'more' }
  return { kind: 'end', count: loadedCount }
}
