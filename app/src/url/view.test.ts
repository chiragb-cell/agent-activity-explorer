// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { EMPTY_VIEW, hasActiveFilters, parseView, serializeView, toEventFilters } from './view'

describe('parseView', () => {
  it('reads every field', () => {
    expect(
      parseView('?q=refund&agent=support-copilot&agent=billing-assistant&status=error&event=evt_1'),
    ).toEqual({
      q: 'refund',
      agents: ['billing-assistant', 'support-copilot'],
      status: 'error',
      event: 'evt_1',
    })
  })

  it('returns the empty view for an empty query string', () => {
    expect(parseView('')).toEqual(EMPTY_VIEW)
  })

  it('drops values it does not understand instead of throwing', () => {
    expect(parseView('?status=bogus&agent=&event=%20&q=%20%20')).toEqual(EMPTY_VIEW)
  })

  it('dedupes and sorts agents, so one view has one URL', () => {
    expect(parseView('?agent=b&agent=a&agent=b').agents).toEqual(['a', 'b'])
  })
})

describe('serializeView', () => {
  it('omits defaults, so the empty view has no query string', () => {
    expect(serializeView(EMPTY_VIEW)).toBe('')
  })

  it('writes keys in a fixed order regardless of input order', () => {
    expect(serializeView({ event: 'evt_1', status: 'ok', agents: ['b', 'a'], q: 'refund' })).toBe(
      '?q=refund&agent=a&agent=b&status=ok&event=evt_1',
    )
  })

  it('round-trips characters that are special in URLs', () => {
    for (const q of ['a&b', 'c#d', '1+1', '100%', 'ünïcödé 🙂', '"quoted" <tag>', 'a=b?c']) {
      expect(parseView(serializeView({ ...EMPTY_VIEW, q })).q).toBe(q)
    }
  })

  it('round-trips agent names with special characters', () => {
    const view = { ...EMPTY_VIEW, agents: ['a&b', 'c d'] }
    expect(parseView(serializeView(view))).toEqual(view)
  })

  it('trims search text before writing it', () => {
    expect(serializeView({ ...EMPTY_VIEW, q: '  refund  ' })).toBe('?q=refund')
  })
})

describe('toEventFilters', () => {
  it('leaves out the open event, so opening the panel never refetches the list', () => {
    const view = { q: 'x', agents: ['a'], status: 'ok' as const, event: 'evt_1' }
    expect(toEventFilters(view)).toEqual({ q: 'x', agents: ['a'], status: 'ok' })
  })
})

describe('hasActiveFilters', () => {
  it('ignores the open event', () => {
    expect(hasActiveFilters({ ...EMPTY_VIEW, event: 'evt_1' })).toBe(false)
    expect(hasActiveFilters({ ...EMPTY_VIEW, status: 'blocked' })).toBe(true)
  })
})
