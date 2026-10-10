// One typed function per endpoint the explorer uses.

import { apiGet } from './client'
import { PAGE_SIZE } from './config'
import { agentsSchema, eventDetailSchema, eventsPageSchema } from './schemas'

/** The list filters the API understands. Built from the URL (see src/url/view.ts). */
export interface EventFilters {
  q: string
  agents: readonly string[]
  status: string | null
}

export function fetchEventsPage(
  filters: EventFilters,
  cursor: string | undefined,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  for (const agent of filters.agents) params.append('agent', agent)
  if (filters.status) params.set('status', filters.status)
  params.set('limit', String(PAGE_SIZE))
  // The cursor is opaque per the brief: pass it back exactly as received.
  if (cursor) params.set('cursor', cursor)
  return apiGet('/events', eventsPageSchema, { params, signal })
}

export function fetchEvent(id: string, signal?: AbortSignal) {
  return apiGet(`/events/${encodeURIComponent(id)}`, eventDetailSchema, { signal })
}

export function fetchAgents(signal?: AbortSignal) {
  return apiGet('/agents', agentsSchema, { signal })
}
