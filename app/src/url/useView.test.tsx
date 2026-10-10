import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  canonicalizeUrl,
  clearFilters,
  clearSearch,
  closeEvent,
  onSearchChangedElsewhere,
  openEvent,
  setSearch,
  setStatus,
  useView,
} from './useView'

// These run against jsdom's real History API, so they check the wiring (push vs replace,
// popstate, Back) that the pure planHistory table can't see.

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('useView', () => {
  it('re-renders on our own navigations and on Back', async () => {
    const { result } = renderHook(() => useView())
    expect(result.current.status).toBeNull()

    act(() => setStatus('error'))
    expect(result.current.status).toBe('error')
    expect(window.location.search).toBe('?status=error')

    act(() => window.history.back())
    await waitFor(() => expect(result.current.status).toBeNull())
  })

  it('undoes a whole burst of search edits with a single Back', async () => {
    act(() => setStatus('ok')) // A known entry to come back to.
    act(() => {
      setSearch('r')
      setSearch('re')
      setSearch('refund')
    })
    expect(window.location.search).toBe('?q=refund&status=ok')

    act(() => window.history.back())
    await waitFor(() => expect(window.location.search).toBe('?status=ok'))
  })

  it('does not add a history entry for a change that changes nothing', () => {
    act(() => setStatus('ok'))
    const before = window.history.length
    act(() => setStatus('ok'))
    expect(window.history.length).toBe(before)
  })

  it('closes a panel it opened by going Back, so Forward reopens it', async () => {
    act(() => setStatus('blocked'))
    act(() => openEvent('evt_1'))
    expect(window.location.search).toBe('?status=blocked&event=evt_1')

    act(() => closeEvent())
    await waitFor(() => expect(window.location.search).toBe('?status=blocked'))

    act(() => window.history.forward())
    await waitFor(() => expect(window.location.search).toBe('?status=blocked&event=evt_1'))
  })

  it('closes a deep-linked panel in place instead of leaving the app', () => {
    window.history.replaceState(null, '', '/?event=evt_9')
    const before = window.history.length
    act(() => closeEvent())
    expect(window.location.search).toBe('')
    expect(window.history.length).toBe(before)
  })

  it('keeps the open event when filters are cleared', () => {
    window.history.replaceState(null, '', '/?q=x&status=ok&event=evt_1')
    act(() => clearFilters())
    expect(window.location.search).toBe('?event=evt_1')
  })
})

describe('onSearchChangedElsewhere', () => {
  it('fires for Back, Clear filters and removing the search, but not for search edits', async () => {
    const heard: string[] = []
    const stop = onSearchChangedElsewhere((q) => heard.push(q))
    try {
      act(() => setSearch('refund')) // The search box's own edit: must stay silent.
      expect(heard).toEqual([])

      act(() => clearSearch())
      expect(heard).toEqual([''])

      act(() => setSearch('sql'))
      act(() => clearFilters())
      expect(heard).toEqual(['', ''])

      act(() => window.history.back())
      await waitFor(() => expect(heard).toEqual(['', '', 'sql']))
    } finally {
      stop()
    }
  })

  it('stays silent when a non-search change leaves the search untouched', () => {
    const heard: string[] = []
    const stop = onSearchChangedElsewhere((q) => heard.push(q))
    act(() => setStatus('error'))
    stop()
    expect(heard).toEqual([])
  })
})

describe('canonicalizeUrl', () => {
  it('rewrites a hand-edited URL in place, without adding history', () => {
    window.history.replaceState(null, '', '/?status=bogus&agent=b&agent=a&agent=a&q=%20x%20')
    const before = window.history.length
    canonicalizeUrl()
    expect(window.location.search).toBe('?q=x&agent=a&agent=b')
    expect(window.history.length).toBe(before)
  })
})
