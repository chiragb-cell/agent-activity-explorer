// Runtime validation at the API boundary. TypeScript types stop at the network edge;
// these schemas check what actually arrives and normalise it for the rest of the app.
//
// Deliberately lenient, because the API is third-party: unknown statuses are kept (and
// shown neutrally), `null` collections become `[]`, and one malformed event is skipped
// instead of blanking the whole page.

import { z } from 'zod'

export const KNOWN_STATUSES = ['ok', 'blocked', 'error'] as const
export type KnownStatus = (typeof KNOWN_STATUSES)[number]

export function isKnownStatus(value: unknown): value is KnownStatus {
  return typeof value === 'string' && (KNOWN_STATUSES as readonly string[]).includes(value)
}

const eventBaseSchema = z.object({
  id: z.string().min(1),
  timestamp: z.iso.datetime({ offset: true }),
  agent: z.string(),
  tool: z.string(),
  // Not an enum: a status the API adds later should render, not crash the table.
  status: z.string(),
  latencyMs: z.number(),
})

export const eventSummarySchema = eventBaseSchema.extend({
  argsPreview: z.string().catch(''),
})
export type EventSummary = z.infer<typeof eventSummarySchema>

export const eventsPageSchema = z.object({
  items: z.array(z.unknown()).nullish().transform(parseEventsLeniently),
  // Both `null` and `''` mean "no more pages"; normalise to undefined for TanStack Query.
  nextCursor: z
    .string()
    .nullish()
    .transform((cursor) => cursor || undefined),
  total: z
    .number()
    .int()
    .nonnegative()
    .nullish()
    .transform((total) => total ?? undefined),
})
export type EventsPage = z.infer<typeof eventsPageSchema>

function parseEventsLeniently(items: unknown[] | null | undefined): EventSummary[] {
  const events: EventSummary[] = []
  for (const item of items ?? []) {
    const result = eventSummarySchema.safeParse(item)
    if (result.success) events.push(result.data)
    else if (import.meta.env.DEV) {
      console.warn('[api] Skipped a malformed event from /events', result.error.issues)
    }
  }
  return events
}

export const eventDetailSchema = eventBaseSchema.extend({
  // Any JSON value per the brief; rendered as text, never interpreted.
  args: z.unknown(),
  result: z.unknown(),
  policyMatches: z
    .array(z.string())
    .nullish()
    .transform((matches) => matches ?? []),
})
export type EventDetail = z.infer<typeof eventDetailSchema>

export const agentsSchema = z
  .array(z.string())
  .nullish()
  .transform((agents) => [...new Set(agents ?? [])].sort())
