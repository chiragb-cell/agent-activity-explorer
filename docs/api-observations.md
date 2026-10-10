# Mock API: what I measured, and what it changed

The brief says to treat the API as a third-party service I don't control, so I measured it before choosing timeouts, retries, page sizes, or states.

- **Reproduce:** `npm run api`, then `node scripts/probe-api.mjs --n 100 --details 1000`.
- **Sample:** 10 Oct 2026, local machine, about 2,000 requests in total.
- **What the probe prints:** statistics and response *shapes* only, never payload text. Event data deliberately contains shell commands, fake credentials, and prompt-injection strings.

## Measurements

| Endpoint | Latency p50 / p95 / max | Failures | Notes |
|---|---|---|---|
| `GET /events` (limit 50 / 100 / 200) | ~850 / ~1,400 / ~1,500 ms | 4–9% `500` | Latency barely depends on page size: p50 is 831 ms at 100 rows and 943 ms at 200. Failed requests are slow too. |
| `GET /events/:id` | 7 / 10 / 14 ms | ~7% `500` | Fast. Bodies are 339 B p50 and 3.4 KB max over 1,000 samples, nested at most 3 levels deep. |
| `GET /agents` | 2 / 5 / 8 ms | ~6% `500` | Returns `string[]` with 12 names. |
| `GET /events/histogram` | ~930 / ~1,450 / ~1,500 ms | ~2% | Not used. I picked the virtualized list as my stretch item. |
| `GET /stream` | first event after ~0.8 s | n/a | SSE with `id:` lines and `retry: 2000`, about 1.5 events/s. Not used. |

**Shapes and semantics**
- **Errors:** always JSON `{ "error": string }` with a readable message.
  - Random `500`s say `"internal server error"`.
  - Bad input gets a `400`, for example `"invalid cursor"` or `"status must be one of ok, blocked, error"`.
  - An unknown id gets `404 "event not found"`.
  - A `limit` above 200 is silently capped at 200.
- **Empty results:** `{ items: [], nextCursor: null, total: 0 }`. `items` is never `null`, and `policyMatches` is always an array.
- **Ordering:** events come newest first. The dataset covers 7 Oct 12:00 to 9 Oct 12:00 UTC: 50,000 events, 86% `ok`, 7% `error`, 7% `blocked`.
- **The dataset grows while anyone is subscribed to `/stream`.** In one sample, `total` went from 50,018 to 50,215.
- **The cursor is a keyset cursor,** `base64("<unixMillis>|<eventId>")`. The brief's example decodes to `{"offset":50}`, so I first assumed offset paging. I tested it instead: I fetched page 1, let 61 new events arrive, then fetched page 2. There was **0 overlap**, and page 2 picked up exactly where page 1 ended.
- **Search:** `q` matches agent, tool, and args on the server. Agent filters are repeatable and status is a single value; both work as documented.
- **CORS:** `Access-Control-Allow-Origin` echoes any localhost origin. No headers are exposed, so the app can't rely on response headers.

## Decisions this drove

| Decision | Why, from the numbers |
|---|---|
| **Page size 200** (the API maximum) | Doubling the rows only adds ~13% latency. Getting through the whole dataset takes half the round trips, so there are half as many chances to hit a random `500`. |
| **10 s request timeout** | About 7× the slowest response I saw (~1.5 s). It never cuts off a legitimate response, but a hung connection still becomes a clear error instead of an endless spinner. |
| **Retry `5xx`, network errors, and timeouts up to 3 times** with exponential backoff + jitter (≈0.4 → 0.8 → 1.6 s) | At a ~9% failure rate, four failures in a row is about a 1-in-15,000 event, so random `500`s are almost never seen. A stopped API still surfaces in about 3 s. |
| **Never retry `4xx`** | Those are deterministic. A `404` shows "Event not found" after exactly one request. A `400` means a bad URL or a bug, so I show the server's message. |
| **"Still loading…" after 2 s** | That's above the observed p99 (~1.5 s), so it only appears when something really is wrong: stacked retries, or a throttled network. |
| **Cursor stays opaque**, but rows are still deduped by `id` | The brief calls it opaque, and its paging guarantees could change. React keys must be unique, so the dedupe is cheap insurance. |
| **Lenient schemas**: `null` is accepted wherever `[]` is expected, and unknown `status` values render neutrally | I never saw them, but the API isn't mine. One odd record shouldn't blank the table. |
| **All payload text renders as inert text** | The data contains shell commands, fake tokens, and prompt-injection strings. No `dangerouslySetInnerHTML`, and no auto-linking. |
