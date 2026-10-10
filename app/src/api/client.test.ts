// @vitest-environment node
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { server } from '../test/server'
import { anySignal, apiGet } from './client'
import { API_BASE_URL } from './config'
import { ApiError } from './errors'

const schema = z.object({ value: z.number() })
const url = `${API_BASE_URL}/thing`

const hang = async () => {
  await delay('infinite')
  return HttpResponse.json({ value: 1 })
}

describe('apiGet', () => {
  it('returns the validated body', async () => {
    server.use(http.get(url, () => HttpResponse.json({ value: 1 })))
    await expect(apiGet('/thing', schema)).resolves.toEqual({ value: 1 })
  })

  it('sends params as a query string, keeping repeated keys', async () => {
    let search = ''
    server.use(
      http.get(url, ({ request }) => {
        search = new URL(request.url).search
        return HttpResponse.json({ value: 1 })
      }),
    )
    await apiGet('/thing', schema, {
      params: new URLSearchParams([
        ['agent', 'a'],
        ['agent', 'b'],
      ]),
    })
    expect(search).toBe('?agent=a&agent=b')
  })

  it('turns an HTTP error into an ApiError that keeps the server message', async () => {
    server.use(
      http.get(url, () => HttpResponse.json({ error: 'internal server error' }, { status: 500 })),
    )
    const error = await apiGet('/thing', schema).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'http', status: 500, message: 'internal server error' })
  })

  it('falls back to a generic message when an error body is not JSON', async () => {
    server.use(http.get(url, () => new HttpResponse('Bad Gateway', { status: 502 })))
    await expect(apiGet('/thing', schema)).rejects.toMatchObject({
      kind: 'http',
      status: 502,
      message: 'Request failed with status 502.',
    })
  })

  it('classifies a failed connection as a network error', async () => {
    server.use(http.get(url, () => HttpResponse.error()))
    await expect(apiGet('/thing', schema)).rejects.toMatchObject({ kind: 'network' })
  })

  it('classifies a hung request as a timeout', async () => {
    server.use(http.get(url, hang))
    await expect(apiGet('/thing', schema, { timeoutMs: 50 })).rejects.toMatchObject({
      kind: 'timeout',
    })
  })

  it('rethrows cancellation untouched, so it never shows up as an error', async () => {
    server.use(http.get(url, hang))
    const controller = new AbortController()
    const request = apiGet('/thing', schema, { signal: controller.signal })
    controller.abort()
    const error = await request.catch((e: unknown) => e)
    expect(error).not.toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ name: 'AbortError' })
  })

  it('reports a body that is not JSON as a parse error', async () => {
    server.use(http.get(url, () => new HttpResponse('{"value": 1', { status: 200 })))
    await expect(apiGet('/thing', schema)).rejects.toMatchObject({ kind: 'parse' })
  })

  it('reports an unexpected shape as a validation error', async () => {
    server.use(http.get(url, () => HttpResponse.json({ value: 'one' })))
    await expect(apiGet('/thing', schema)).rejects.toMatchObject({ kind: 'validation' })
  })
})

describe('anySignal', () => {
  it('aborts with the reason of whichever input aborts first', () => {
    const a = new AbortController()
    const b = new AbortController()
    const combined = anySignal([a.signal, b.signal])
    b.abort('b went first')
    expect(combined.aborted).toBe(true)
    expect(combined.reason).toBe('b went first')
  })

  it('works on browsers without AbortSignal.any', () => {
    const original = AbortSignal.any
    // Simulate a browser that predates AbortSignal.any (Safari < 17.4).
    Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true })
    try {
      const a = new AbortController()
      const alreadyAborted = AbortSignal.abort('already')
      expect(anySignal([a.signal, alreadyAborted]).reason).toBe('already')

      const b = new AbortController()
      const combined = anySignal([a.signal, b.signal])
      expect(combined.aborted).toBe(false)
      a.abort('a')
      expect(combined.reason).toBe('a')
    } finally {
      Object.defineProperty(AbortSignal, 'any', { value: original, configurable: true })
    }
  })
})
