// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ApiError, explainError } from './errors'

describe('explainError', () => {
  it('offers a retry for transient failures', () => {
    for (const error of [
      new ApiError('network', 'x'),
      new ApiError('timeout', 'x'),
      new ApiError('http', 'x', { status: 500 }),
      new ApiError('http', 'x', { status: 429 }),
    ]) {
      expect(explainError(error).canRetry).toBe(true)
    }
  })

  it('flags 404 as not found, with no retry', () => {
    expect(explainError(new ApiError('http', 'event not found', { status: 404 }))).toMatchObject({
      notFound: true,
      canRetry: false,
    })
  })

  it("passes a rejected request's server message through, without a retry", () => {
    const explanation = explainError(new ApiError('http', 'invalid cursor', { status: 400 }))
    expect(explanation.message).toContain('invalid cursor')
    expect(explanation.canRetry).toBe(false)
  })

  it('falls back to generic copy for errors that are not ApiErrors', () => {
    expect(explainError(new Error('boom')).message).toMatch(/unexpected/i)
  })
})
