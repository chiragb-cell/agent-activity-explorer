// A deterministic stand-in for the mock API, installed per test with page.route. The
// real binary fails at random (4–9% of requests), which is right for exercising the app
// by hand but would make assertions flaky; here each test decides exactly what fails.
//
// The shapes match what the real API returns (see docs/api-observations.md). The cursor
// is a plain index rather than the real base64 keyset, which is fine: the app treats it
// as opaque and only ever passes it back.

import type { Page, Route } from '@playwright/test'

export const API_ORIGIN = 'http://localhost:4000'
export const AGENTS = ['billing-assistant', 'code-reviewer', 'data-analyst', 'support-copilot']
const TOOLS = ['http.request', 'sql.query', 'email.send', 'shell.exec']
const STATUSES = ['ok', 'ok', 'blocked', 'error']

export interface FakeEvent {
  id: string
  timestamp: string
  agent: string
  tool: string
  status: string
  latencyMs: number
  argsPreview: string
}

/** Newest first, like the API: `evt_00000` is the latest. */
export function makeEvents(count: number): FakeEvent[] {
  return Array.from({ length: count }, (_, n) => ({
    id: `evt_${String(n).padStart(5, '0')}`,
    timestamp: new Date(Date.UTC(2026, 9, 9, 12, 0, 0) - n * 7_000).toISOString(),
    agent: AGENTS[n % AGENTS.length]!,
    tool: TOOLS[n % TOOLS.length]!,
    status: STATUSES[n % STATUSES.length]!,
    latencyMs: 40 + ((n * 37) % 1500),
    argsPreview: `{"request":${n}}`,
  }))
}

export interface FakeApiOptions {
  /** How many events exist. */
  total: number
  /** The first page of /events: served, answered with a 500, refused, or empty. */
  firstPage: 'ok' | 'error' | 'refused' | 'empty'
  /** Every later page (requests with a cursor). */
  nextPages: 'ok' | 'error'
  /** The first `failFirst` /events requests answer 500, then it behaves. */
  failFirst: number
  /** Delay before the first /events response, to show the slow state. */
  firstResponseDelayMs: number
  /**
   * Each later page starts this many events early, repeating the end of the previous
   * page, as an offset-paged API does when new events arrive mid-scroll.
   */
  overlap: number
}

const DEFAULTS: FakeApiOptions = {
  total: 1000,
  firstPage: 'ok',
  nextPages: 'ok',
  failFirst: 0,
  firstResponseDelayMs: 0,
  overlap: 0,
}

// The app's requests are cross-origin (preview on :4173, API on :4000), so fulfilled
// responses need the same CORS header the real API sends.
const CORS = { 'access-control-allow-origin': '*' }

export async function fakeApi(page: Page, initial: Partial<FakeApiOptions> = {}) {
  const options: FakeApiOptions = { ...DEFAULTS, ...initial }
  let events = makeEvents(options.total)
  const requests = { firstPage: 0, nextPages: 0, details: 0 }

  await page.route(
    (url) => url.origin === API_ORIGIN,
    async (route: Route) => {
      const url = new URL(route.request().url())
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, json: body, headers: CORS })

      if (url.pathname === '/agents') return json(AGENTS)

      if (url.pathname === '/events') {
        const cursor = url.searchParams.get('cursor')
        if (cursor === null) {
          requests.firstPage++
          if (requests.firstPage === 1 && options.firstResponseDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, options.firstResponseDelayMs))
          }
          if (options.firstPage === 'refused') return route.abort('connectionrefused')
          if (options.firstPage === 'error' || requests.firstPage <= options.failFirst) {
            return json({ error: 'internal server error' }, 500)
          }
        } else {
          requests.nextPages++
          if (options.nextPages === 'error') return json({ error: 'internal server error' }, 500)
        }
        const matching = options.firstPage === 'empty' ? [] : filter(events, url.searchParams)
        const limit = Number(url.searchParams.get('limit') ?? 50)
        const start = cursor === null ? 0 : Math.max(0, Number(cursor) - options.overlap)
        const end = start + limit
        return json({
          items: matching.slice(start, end),
          nextCursor: end < matching.length ? String(end) : null,
          total: matching.length,
        })
      }

      if (url.pathname.startsWith('/events/')) {
        requests.details++
        const id = decodeURIComponent(url.pathname.slice('/events/'.length))
        const event = events.find((e) => e.id === id)
        if (!event) return json({ error: 'event not found' }, 404)
        const { argsPreview: _preview, ...base } = event
        return json({
          ...base,
          args: { request: event.id, query: 'SELECT 1' },
          result: { ok: event.status === 'ok' },
          policyMatches: event.status === 'blocked' ? ['secrets.leak'] : [],
        })
      }

      return json({ error: 'not found' }, 404)
    },
  )

  return {
    requests,
    /** Changes behaviour before or during a test, e.g. to let a retry succeed. */
    set(next: Partial<FakeApiOptions>) {
      Object.assign(options, next)
      if (next.total !== undefined) events = makeEvents(next.total)
    },
  }
}

export type FakeApi = Awaited<ReturnType<typeof fakeApi>>

function filter(events: FakeEvent[], params: URLSearchParams) {
  const q = params.get('q')?.toLowerCase()
  const agents = params.getAll('agent')
  const status = params.get('status')
  return events.filter(
    (e) =>
      (!q || `${e.agent} ${e.tool} ${e.argsPreview}`.toLowerCase().includes(q)) &&
      (agents.length === 0 || agents.includes(e.agent)) &&
      (!status || e.status === status),
  )
}
