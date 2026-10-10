// API settings. The numbers come from measuring the mock API (docs/api-observations.md).

/** Where the events API lives. Override with VITE_API_URL, e.g. for a different port. */
export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(
  /\/+$/,
  '',
)

/**
 * Per-request timeout. The slowest response measured was ~1.5 s, so 10 s never cuts off a
 * legitimate response, but a hung connection still becomes an error the user can act on.
 */
export const REQUEST_TIMEOUT_MS = 10_000

/**
 * The API's maximum page size. Latency barely depends on it (p50 831 ms at 100 rows vs
 * 943 ms at 200), so the largest page halves the round trips needed to scroll the dataset.
 */
export const PAGE_SIZE = 200
