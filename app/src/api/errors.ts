// Errors from the API layer, classified so the UI can explain what happened in plain
// language and decide whether offering "Try again" makes sense.

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'parse' | 'validation'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  /** HTTP status code, set when `kind` is `'http'`. */
  readonly status: number | undefined

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
    this.kind = kind
    this.status = options.status
  }
}

export interface ErrorExplanation {
  /** One or two sentences a non-technical user can act on. */
  message: string
  /** Whether a manual "Try again" could plausibly succeed. */
  canRetry: boolean
  notFound: boolean
}

/** Turns any thrown value into copy for people, never a raw stack trace or a bare status code. */
export function explainError(error: unknown): ErrorExplanation {
  if (!(error instanceof ApiError)) {
    return {
      message: 'Something unexpected went wrong. Try again, or reload the page.',
      canRetry: true,
      notFound: false,
    }
  }

  switch (error.kind) {
    case 'network':
      return {
        message: import.meta.env.DEV
          ? "We couldn't connect to the server. Is the mock API running? Start it with `npm run api`."
          : "We couldn't connect to the server. Check your connection and try again.",
        canRetry: true,
        notFound: false,
      }
    case 'timeout':
      return {
        message: 'The server took too long to respond. It may be busy, so try again in a moment.',
        canRetry: true,
        notFound: false,
      }
    case 'parse':
    case 'validation':
      return {
        message:
          "The server sent a response we couldn't read. Try again; if it keeps happening, the API may have changed.",
        canRetry: true,
        notFound: false,
      }
    case 'http':
      return explainHttpError(error.status ?? 0, error.message)
  }
}

function explainHttpError(status: number, serverMessage: string): ErrorExplanation {
  if (status === 404) {
    return {
      message: "It doesn't exist. It may have been removed, or the link may be wrong.",
      canRetry: false,
      notFound: true,
    }
  }
  if (status === 429) {
    return {
      message: 'Too many requests right now. Wait a few seconds and try again.',
      canRetry: true,
      notFound: false,
    }
  }
  if (status >= 500 || status === 408) {
    return {
      message: `The server ran into a problem (error ${status}). This is usually temporary, so try again.`,
      canRetry: true,
      notFound: false,
    }
  }
  // Other 4xx: the request itself was rejected, so retrying won't change the outcome.
  return {
    message: `The server rejected the request: ${serverMessage}`,
    canRetry: false,
    notFound: false,
  }
}
