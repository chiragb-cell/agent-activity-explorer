// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ApiError, type ApiErrorKind } from './errors'
import { backoffDelay, isRetryable, MAX_RETRIES, shouldRetry } from './retry'

describe('isRetryable', () => {
  it.each<[ApiErrorKind, number | undefined, boolean]>([
    ['network', undefined, true],
    ['timeout', undefined, true],
    ['http', 500, true],
    ['http', 503, true],
    ['http', 429, true],
    ['http', 408, true],
    ['http', 400, false],
    ['http', 404, false],
    ['parse', undefined, false],
    ['validation', undefined, false],
  ])('%s %s → %s', (kind, status, expected) => {
    expect(isRetryable(new ApiError(kind, 'x', { status }))).toBe(expected)
  })

  it('never retries errors that did not come from the API (e.g. bugs in our code)', () => {
    expect(isRetryable(new TypeError('boom'))).toBe(false)
  })
})

describe('shouldRetry', () => {
  it(`retries a transient failure up to ${MAX_RETRIES} times`, () => {
    const error = new ApiError('http', 'x', { status: 500 })
    expect([0, 1, 2, 3].map((failureCount) => shouldRetry(failureCount, error))).toEqual([
      true,
      true,
      true,
      false,
    ])
  })
})

describe('backoffDelay', () => {
  it('doubles with each attempt', () => {
    expect([0, 1, 2].map((attempt) => backoffDelay(attempt, 0.5))).toEqual([400, 800, 1600])
  })

  it('jitters by at most ±25%', () => {
    expect(backoffDelay(0, 0)).toBe(300)
    expect(backoffDelay(0, 0.999)).toBeLessThanOrEqual(500)
  })
})
