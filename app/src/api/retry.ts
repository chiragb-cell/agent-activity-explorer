// Retry policy for TanStack Query, tuned from measurements (docs/api-observations.md):
// 4-9% of requests fail with a random 500, so a few quick retries hide almost all of
// them, while a stopped API still surfaces as an error in about three seconds.

import { ApiError } from './errors'

export const MAX_RETRIES = 3

/** Only transient failures are worth retrying; 4xx responses and bad payloads repeat. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  switch (error.kind) {
    case 'network':
    case 'timeout':
      return true
    case 'http':
      return (
        error.status === 408 ||
        error.status === 429 ||
        (error.status !== undefined && error.status >= 500)
      )
    case 'parse':
    case 'validation':
      return false
  }
}

/** TanStack Query `retry` callback. `failureCount` is 0 when deciding the first retry. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && isRetryable(error)
}

/** TanStack Query `retryDelay` callback: ≈400 → 800 → 1600 ms. */
export function retryDelay(failureCount: number): number {
  return backoffDelay(failureCount, Math.random())
}

/**
 * Exponential backoff with ±25% jitter, so clients that failed together don't all retry
 * in the same instant. `jitter` is a number in [0, 1).
 */
export function backoffDelay(attempt: number, jitter: number): number {
  return Math.round(400 * 2 ** attempt * (0.75 + jitter * 0.5))
}
