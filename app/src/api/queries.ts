// Query keys and data hooks. Keys are built from the URL's filters, so one view is one
// cache entry, and Back/Forward to a view already loaded renders instantly from cache.

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { useMemo } from 'react'
import { fetchAgents, fetchEvent, fetchEventsPage, type EventFilters } from './endpoints'
import type { EventSummary, EventsPage } from './schemas'

type Cursor = string | undefined

export const queryKeys = {
  eventList: (filters: EventFilters) => ['events', 'list', filters] as const,
  agents: ['agents'] as const,
  event: (id: string) => ['events', 'detail', id] as const,
}

export function useEventList(filters: EventFilters) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.eventList(filters),
    queryFn: ({ pageParam, signal }) => fetchEventsPage(filters, pageParam, signal),
    initialPageParam: undefined as Cursor,
    // End of list is decided by the cursor alone; `total` grows while the API runs.
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // While a new filter loads, keep showing the previous rows (dimmed) instead of
    // flashing an empty table.
    placeholderData: keepPreviousData,
    // An infinite query refetches *every* loaded page when it goes stale: with 50 pages
    // loaded against a flaky API that is 50 sequential requests. So it never refetches
    // on its own; "Refresh" reloads page 1 only (refreshEventList).
    staleTime: Infinity,
    refetchOnReconnect: false,
  })

  const events = useMemo(() => flattenUnique(query.data), [query.data])
  // The latest page has the freshest count.
  const total = query.data?.pages.at(-1)?.total
  return { query, events, total }
}

/**
 * Flattens pages into one list, dropping repeated ids. The cursor is keyset-based today
 * (docs/api-observations.md), but React keys must be unique and paging guarantees belong
 * to an API we don't control, so this stays as cheap insurance.
 */
export function flattenUnique(data: { pages: EventsPage[] } | undefined): EventSummary[] {
  if (!data) return []
  const seen = new Set<string>()
  const events: EventSummary[] = []
  for (const page of data.pages) {
    for (const event of page.items) {
      if (seen.has(event.id)) continue
      seen.add(event.id)
      events.push(event)
    }
  }
  return events
}

/** Reloads a list from its first page instead of re-fetching every page already loaded. */
export async function refreshEventList(queryClient: QueryClient, filters: EventFilters) {
  const queryKey = queryKeys.eventList(filters)
  queryClient.setQueryData<InfiniteData<EventsPage, Cursor>>(queryKey, (data) =>
    data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data,
  )
  await queryClient.refetchQueries({ queryKey, exact: true })
}

/** Agent names for the filter. They rarely change, so five minutes of freshness is plenty. */
export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: ({ signal }) => fetchAgents(signal),
    staleTime: 5 * 60_000,
  })
}

/**
 * The full event for the detail panel. Events never change once recorded, so a loaded
 * event is fresh forever; a 404 is not retried (see retry.ts), so "not found" shows
 * after exactly one request.
 */
export function useEventDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.event(id),
    queryFn: ({ signal }) => fetchEvent(id, signal),
    staleTime: Infinity,
  })
}
