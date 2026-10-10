// Display formatting for times, latencies and counts.
//
// Formatters are created once and reused: building an Intl formatter per call (which is
// what `toLocaleString(locale, options)` does) is expensive when a table renders
// thousands of cells. `createFormat` takes a locale and time zone so tests can pin them;
// the app uses the visitor's own.

export function createFormat(locale?: string, timeZone?: string) {
  const eventTime = new Intl.DateTimeFormat(locale, {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  })
  const fullTime = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
    timeZoneName: 'short',
  })
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const twoDecimals = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const oneDecimal = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })

  const timeZoneLabel =
    new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value ?? 'local time'

  return {
    /** Compact, for table cells: "Oct 9, 14:21:07.123" in the visitor's time zone. */
    eventTime: (iso: string) => eventTime.format(new Date(iso)),
    /** Unambiguous, for the detail panel: weekday, year and time-zone name included. */
    fullTime: (iso: string) => fullTime.format(new Date(iso)),
    /** e.g. "GMT+5:30", shown in the Time column header so times are never ambiguous. */
    timeZoneLabel,
    /** "412 ms" under a second, then "1.24 s", then "30.0 s". */
    latency(ms: number) {
      if (ms < 1000) return `${integer.format(ms)} ms`
      if (ms < 10_000) return `${twoDecimals.format(ms / 1000)} s`
      return `${oneDecimal.format(ms / 1000)} s`
    },
    count: (n: number) => integer.format(n),
    /** "1 event", "50,213 events". */
    plural: (n: number, noun: string) => `${integer.format(n)} ${n === 1 ? noun : `${noun}s`}`,
  }
}

export const format = createFormat()
