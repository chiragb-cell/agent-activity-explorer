// The explorer screen: reads the view from the URL, loads the matching events and
// renders the list (and, later in this file's history, the toolbar and detail panel).

import { useCallback, useMemo } from 'react'
import { explainError } from '../../api/errors'
import { useEventList } from '../../api/queries'
import { Button } from '../../components/Button'
import { StateMessage } from '../../components/StateMessage'
import { format } from '../../lib/format'
import { openEvent, useView } from '../../url/useView'
import { parseView, serializeView, toEventFilters } from '../../url/view'
import { EventTable, type FooterState } from './EventTable'
import styles from './EventsPage.module.css'

export function EventsPage() {
  const view = useView()
  // Key everything list-related on the filters only, so opening or switching the detail
  // panel never re-renders every row or refetches the list.
  const filtersSearch = serializeView({ ...view, event: null })
  const filters = useMemo(() => toEventFilters(parseView(filtersSearch)), [filtersSearch])
  const { query, events, total } = useEventList(filters)
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } = query

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

  if (query.isPending) {
    return <p className={styles.placeholder}>Loading events…</p>
  }

  if (query.isError && events.length === 0) {
    const { message, canRetry } = explainError(query.error)
    return (
      <StateMessage
        title="Couldn’t load events"
        tone="error"
        actions={canRetry ? <Button onClick={() => void query.refetch()}>Try again</Button> : null}
      >
        {message}
      </StateMessage>
    )
  }

  return (
    <section className={styles.list} aria-labelledby="events-heading">
      <div className={styles.listHeader}>
        <h2 id="events-heading" className={styles.listTitle}>
          Events
        </h2>
        {total !== undefined ? (
          <p className={styles.count}>
            {format.plural(total, 'event')}
            {events.length < total ? ` · ${format.count(events.length)} loaded` : null}
          </p>
        ) : null}
      </div>
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
      />
    </section>
  )
}

function footerState(
  query: ReturnType<typeof useEventList>['query'],
  loadedCount: number,
): FooterState {
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
