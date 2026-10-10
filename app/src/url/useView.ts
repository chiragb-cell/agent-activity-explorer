// React binding for the URL-backed view state, plus the navigation actions.
//
// useSyncExternalStore reads `location.search` directly, so React can never drift from
// the URL: there is no copy of the filters in React state to keep in sync.

import { useMemo, useSyncExternalStore } from 'react'
import { planHistory, type Navigation } from './history'
import { EMPTY_VIEW, parseView, serializeView, type ViewState } from './view'
import type { KnownStatus } from '../api/schemas'

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

function getSearch() {
  return window.location.search
}

/** The current view, re-rendering whenever the URL changes (our navigations or Back/Forward). */
export function useView(): ViewState {
  const search = useSyncExternalStore(subscribe, getSearch)
  return useMemo(() => parseView(search), [search])
}

function urlFor(view: ViewState) {
  return `${window.location.pathname}${serializeView(view)}${window.location.hash}`
}

function notify() {
  listeners.forEach((listener) => listener())
}

/**
 * Applies a change to the *current* URL (read at call time, so a stale closure such as a
 * debounced search callback can't overwrite newer state), using the history policy.
 */
function update(change: (current: ViewState) => ViewState, navigation: Navigation) {
  const current = parseView(window.location.search)
  const next = change(current)
  // A no-op must not create a history entry (e.g. picking the status that's already set).
  if (serializeView(next) === serializeView(current)) return

  const action = planHistory(navigation, window.history.state)
  if (action.method === 'back') {
    window.history.back() // The browser fires popstate, which re-renders subscribers.
    return
  }
  if (action.method === 'push') window.history.pushState(action.state, '', urlFor(next))
  else window.history.replaceState(action.state, '', urlFor(next))
  notify()
}

export function setSearch(q: string) {
  update((view) => ({ ...view, q: q.trim() }), { type: 'search' })
}

export function setStatus(status: KnownStatus | null) {
  update((view) => ({ ...view, status }), { type: 'filter' })
}

export function setAgents(agents: string[]) {
  update((view) => ({ ...view, agents }), { type: 'filter' })
}

/** Clears search and filters but keeps the open event, which is independent of them. */
export function clearFilters() {
  update((view) => ({ ...EMPTY_VIEW, event: view.event }), { type: 'filter' })
}

export function openEvent(id: string) {
  const panelAlreadyOpen = parseView(window.location.search).event !== null
  update((view) => ({ ...view, event: id }), { type: 'open-event', panelAlreadyOpen })
}

export function closeEvent() {
  update((view) => ({ ...view, event: null }), { type: 'close-event' })
}

/**
 * Rewrites a hand-edited URL into canonical form without adding a history entry, so the
 * address bar always shows the one URL for this view. Called once before the first render.
 */
export function canonicalizeUrl() {
  const canonical = serializeView(parseView(window.location.search))
  if (canonical !== window.location.search) {
    const url = `${window.location.pathname}${canonical}${window.location.hash}`
    window.history.replaceState(window.history.state, '', url)
    notify()
  }
}

/** Builds the link for a row, so cmd/middle-click and "copy link" open the same view. */
export function hrefForEvent(view: ViewState, id: string) {
  return `${window.location.pathname}${serializeView({ ...view, event: id })}`
}
