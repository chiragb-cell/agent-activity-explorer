// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createFormat } from './format'

const format = createFormat('en-US', 'UTC')

describe('format', () => {
  it('shows event times compactly, with milliseconds and a 24-hour clock', () => {
    expect(format.eventTime('2026-10-09T14:21:07.123Z')).toBe('Oct 9, 14:21:07.123')
    expect(format.eventTime('2026-10-09T00:05:00.000Z')).toBe('Oct 9, 00:05:00.000')
  })

  it('converts to the given time zone', () => {
    expect(createFormat('en-US', 'Asia/Kolkata').eventTime('2026-10-09T14:21:07.123Z')).toBe(
      'Oct 9, 19:51:07.123',
    )
  })

  it('includes the time zone in the full timestamp and the column label', () => {
    expect(format.fullTime('2026-10-09T14:21:07.123Z')).toMatch(
      /Fri, Oct 9, 2026.*14:21:07.123 UTC/,
    )
    expect(format.timeZoneLabel).toBe('UTC')
  })

  it('switches latency units at one and ten seconds', () => {
    expect(format.latency(0)).toBe('0 ms')
    expect(format.latency(999)).toBe('999 ms')
    expect(format.latency(1000)).toBe('1.00 s')
    expect(format.latency(1462)).toBe('1.46 s')
    expect(format.latency(30000)).toBe('30.0 s')
  })

  it('formats counts and plurals', () => {
    expect(format.count(50213)).toBe('50,213')
    expect(format.plural(1, 'event')).toBe('1 event')
    expect(format.plural(50213, 'event')).toBe('50,213 events')
  })
})
