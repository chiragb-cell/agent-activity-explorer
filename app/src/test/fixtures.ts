import { http, HttpResponse } from 'msw'
import { API_BASE_URL } from '../api/config'
import type { EventSummary } from '../api/schemas'

export const API = API_BASE_URL

const AGENTS = ['billing-assistant', 'code-reviewer', 'data-analyst']
const TOOLS = ['http.request', 'sql.query', 'email.send']
const STATUSES = ['ok', 'blocked', 'error']

/** `count` events, newest first, with ids evt_0000, evt_0001, … */
export function makeEvents(count: number, offset = 0): EventSummary[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + offset
    return {
      id: `evt_${String(n).padStart(4, '0')}`,
      timestamp: new Date(Date.UTC(2026, 9, 9, 12, 0, 0) - n * 1000).toISOString(),
      agent: AGENTS[n % AGENTS.length] ?? 'agent',
      tool: TOOLS[n % TOOLS.length] ?? 'tool',
      status: STATUSES[n % STATUSES.length] ?? 'ok',
      latencyMs: 100 + n,
      argsPreview: `{"n": ${n}}`,
    }
  })
}

/** The full event, as /events/:id returns it. */
export function detailOf(event: EventSummary, extra: Partial<Record<string, unknown>> = {}) {
  const { argsPreview: _preview, ...base } = event
  return {
    ...base,
    args: { query: 'SELECT 1', n: event.id },
    result: { rows: 1 },
    policyMatches: event.status === 'blocked' ? ['secrets.leak'] : [],
    ...extra,
  }
}

export const agentsHandler = http.get(`${API}/agents`, () => HttpResponse.json(AGENTS))

/** /events serving `events` in pages of `pageSize`, following the cursor. */
export function pagedEventsHandler(events: EventSummary[], pageSize = 3) {
  return http.get(`${API}/events`, ({ request }) => {
    const cursor = new URL(request.url).searchParams.get('cursor')
    const start = cursor ? Number(cursor) : 0
    const items = events.slice(start, start + pageSize)
    const next = start + pageSize < events.length ? String(start + pageSize) : null
    return HttpResponse.json({ items, nextCursor: next, total: events.length })
  })
}

export const serverError = () =>
  HttpResponse.json({ error: 'internal server error' }, { status: 500 })
