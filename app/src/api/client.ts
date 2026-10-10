// The only place the app talks to the network.
//
// A thin wrapper over fetch instead of a client library: on top of fetch we only need a
// per-request timeout, cancellation, runtime validation and errors the UI can explain.

import type { z } from 'zod'
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from './config'
import { ApiError } from './errors'

export interface GetOptions {
  params?: URLSearchParams
  /** Comes from TanStack Query; aborted when the query is cancelled or superseded. */
  signal?: AbortSignal
  timeoutMs?: number
}

/**
 * GETs `path`, validates the JSON body with `schema` and returns the parsed value.
 * Throws an {@link ApiError} for every failure except cancellation, which is rethrown
 * untouched so the caller can ignore it.
 */
export async function apiGet<T>(
  path: string,
  schema: z.ZodType<T>,
  options: GetOptions = {},
): Promise<T> {
  const { params, signal, timeoutMs = REQUEST_TIMEOUT_MS } = options
  const query = params?.toString()
  const url = `${API_BASE_URL}${path}${query ? `?${query}` : ''}`
  const timeout = AbortSignal.timeout(timeoutMs)

  let response: Response
  let text: string
  try {
    // No custom headers on purpose: anything outside the CORS-safelisted set adds a
    // preflight request, doubling round trips (and chances to fail) per call.
    response = await fetch(url, { signal: signal ? anySignal([signal, timeout]) : timeout })
    text = await response.text()
  } catch (error) {
    if (signal?.aborted) throw error
    // Decide by which signal fired rather than by error.name: browsers disagree on the
    // name, but only our own timeout is a failure the user needs to hear about.
    if (timeout.aborted) {
      throw new ApiError('timeout', `No response within ${timeoutMs / 1000} seconds.`, {
        cause: error,
      })
    }
    throw new ApiError('network', 'Could not connect to the server.', { cause: error })
  }

  const body = parseJson(text)
  if (!response.ok) {
    const message = errorMessageFrom(body) ?? `Request failed with status ${response.status}.`
    throw new ApiError('http', message, { status: response.status })
  }
  if (body === INVALID_JSON) {
    throw new ApiError('parse', 'The response was not valid JSON.')
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    throw new ApiError('validation', 'The response did not have the expected shape.', {
      cause: result.error,
    })
  }
  return result.data
}

const INVALID_JSON = Symbol('invalid JSON')

function parseJson(text: string): unknown {
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return INVALID_JSON
  }
}

/** The API reports failures as `{ "error": string }`. */
function errorMessageFrom(body: unknown): string | undefined {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    return typeof body.error === 'string' ? body.error : undefined
  }
  return undefined
}

/**
 * `AbortSignal.any`, with a fallback because it's only been Baseline since 2024
 * (Safari 17.4), newer than Vite's default "widely available" build target.
 */
export function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals)

  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      break
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      once: true,
      signal: controller.signal,
    })
  }
  return controller.signal
}
