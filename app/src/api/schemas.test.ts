// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { agentsSchema, eventDetailSchema, eventsPageSchema } from './schemas'

const event = {
  id: 'evt_01',
  timestamp: '2026-10-09T14:21:07.123Z',
  agent: 'billing-assistant',
  tool: 'http.request',
  status: 'ok',
  latencyMs: 412,
  argsPreview: '{"url": "https://api.example.com"}',
}

describe('eventsPageSchema', () => {
  it('passes a well-formed page through', () => {
    expect(eventsPageSchema.parse({ items: [event], nextCursor: 'abc', total: 1 })).toEqual({
      items: [event],
      nextCursor: 'abc',
      total: 1,
    })
  })

  it('treats null items, and a null or empty cursor, as "no more pages"', () => {
    expect(eventsPageSchema.parse({ items: null, nextCursor: null, total: 0 })).toEqual({
      items: [],
      nextCursor: undefined,
      total: 0,
    })
    expect(eventsPageSchema.parse({ items: [], nextCursor: '' }).nextCursor).toBeUndefined()
  })

  it('skips a malformed event instead of failing the whole page', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const page = eventsPageSchema.parse({
      items: [event, { id: 42 }, { ...event, id: 'evt_02', timestamp: 'yesterday' }],
      nextCursor: 'abc',
      total: 3,
    })
    expect(page.items.map((e) => e.id)).toEqual(['evt_01'])
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('keeps a status it does not know, so new API values still render', () => {
    const page = eventsPageSchema.parse({ items: [{ ...event, status: 'throttled' }] })
    expect(page.items[0]?.status).toBe('throttled')
  })

  it('defaults a missing argsPreview to an empty string', () => {
    const { argsPreview: _omitted, ...withoutPreview } = event
    const page = eventsPageSchema.parse({ items: [withoutPreview] })
    expect(page.items[0]?.argsPreview).toBe('')
  })
})

describe('eventDetailSchema', () => {
  const { argsPreview: _omitted, ...base } = event

  it('accepts any JSON value for args and result', () => {
    for (const value of [null, 'text', 42, [1, 2], { nested: { deep: true } }]) {
      const detail = eventDetailSchema.parse({
        ...base,
        args: value,
        result: value,
        policyMatches: [],
      })
      expect(detail.args).toEqual(value)
    }
  })

  it('turns null policyMatches into an empty list', () => {
    const detail = eventDetailSchema.parse({ ...base, args: {}, result: {}, policyMatches: null })
    expect(detail.policyMatches).toEqual([])
  })
})

describe('agentsSchema', () => {
  it('dedupes and sorts agent names, and treats null as none', () => {
    expect(agentsSchema.parse(['b', 'a', 'b'])).toEqual(['a', 'b'])
    expect(agentsSchema.parse(null)).toEqual([])
  })
})
