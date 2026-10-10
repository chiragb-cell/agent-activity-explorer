// The explorer's view state and its URL encoding.
//
// The URL is the single source of truth for what the user is looking at. That is what
// makes refresh, back/forward and shared links work. These functions are pure, so the
// URL contract can be tested without a browser:
//
//   ?q=refund&agent=billing-assistant&agent=support-copilot&status=error&event=evt_123

import type { EventFilters } from '../api/endpoints'
import { isKnownStatus, type KnownStatus } from '../api/schemas'

export interface ViewState {
  /** Free-text search, trimmed; '' means no search. */
  q: string
  /** Selected agents, unique and sorted, so each view has exactly one URL (and cache key). */
  agents: string[]
  status: KnownStatus | null
  /** Id of the event open in the detail panel. */
  event: string | null
}

export const EMPTY_VIEW: ViewState = { q: '', agents: [], status: null, event: null }

/** Reads a view from `location.search`. Invalid or unknown values are dropped, never thrown. */
export function parseView(search: string): ViewState {
  const params = new URLSearchParams(search)
  const status = params.get('status')
  const event = params.get('event')?.trim()
  return {
    q: (params.get('q') ?? '').trim(),
    agents: normalizeAgents(params.getAll('agent')),
    status: isKnownStatus(status) ? status : null,
    event: event ? event : null,
  }
}

/** Canonical query string for a view (`''` for the default view), in a fixed key order. */
export function serializeView(view: ViewState): string {
  const params = new URLSearchParams()
  const q = view.q.trim()
  if (q) params.set('q', q)
  for (const agent of normalizeAgents(view.agents)) params.append('agent', agent)
  if (view.status) params.set('status', view.status)
  if (view.event) params.set('event', view.event)
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** The part of the view that decides which events are listed (not which one is open). */
export function toEventFilters(view: ViewState): EventFilters {
  return { q: view.q, agents: view.agents, status: view.status }
}

export function hasActiveFilters(view: ViewState): boolean {
  return view.q !== '' || view.agents.length > 0 || view.status !== null
}

function normalizeAgents(agents: readonly string[]): string[] {
  return [...new Set(agents.map((agent) => agent.trim()).filter(Boolean))].sort()
}
