// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { flattenUnique } from './queries'
import type { EventSummary } from './schemas'

const event = (id: string): EventSummary => ({
  id,
  timestamp: '2026-10-09T14:21:07.123Z',
  agent: 'a',
  tool: 't',
  status: 'ok',
  latencyMs: 1,
  argsPreview: '',
})

describe('flattenUnique', () => {
  it('flattens pages in order and drops repeated ids', () => {
    const data = {
      pages: [
        { items: [event('1'), event('2')], nextCursor: 'c1', total: 4 },
        { items: [event('2'), event('3'), event('4')], nextCursor: undefined, total: 4 },
      ],
      pageParams: [undefined, 'c1'],
    }
    expect(flattenUnique(data).map((e) => e.id)).toEqual(['1', '2', '3', '4'])
  })

  it('returns an empty list before the first page arrives', () => {
    expect(flattenUnique(undefined)).toEqual([])
  })
})
