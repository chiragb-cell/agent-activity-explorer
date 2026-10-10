# Agent Activity Explorer: the app

The React + TypeScript app for Part A. This page explains how it's put together. For what was built and why, see [NOTES.md](../NOTES.md). For how the API actually behaves, see [docs/api-observations.md](../docs/api-observations.md).

```bash
npm install          # from the repo root: installs every workspace
npm run dev          # mock API on :4000 and this app on http://localhost:5173
npm test             # unit and component tests (Vitest, jsdom, MSW)
npm run e2e          # end-to-end + axe (Playwright, against the production build)
```

## How data flows

```
 location.search ──► useView()                 one source of truth, read with useSyncExternalStore
        ▲                │ parseView()          pure; unknown values dropped, never thrown
        │                ▼
  useView actions     filters ──► useEventList()      TanStack Query infinite query, keyed by filters
  (planHistory)                        │
                                       ▼
                         fetchEventsPage() ──► apiGet()     timeout, cancellation, classified errors
                                                    │
                                                    ▼
                                             zod schemas    lenient: bad rows skipped, nulls normalised
                                                    │
                                                    ▼
             EventsPage ──► EventTable (virtualized) ──► row click ──► openEvent(id) ──► ?event=id
                         └► EventDetailPanel (column ≥1024 px, <dialog> drawer below)
```

The **URL is the only state** for search, filters and the open event. Nothing mirrors it in React state, so it can't drift: a refresh, Back/Forward or a pasted link always rebuilds the same screen.

## Where things live

| Folder                                      | What's in it                                                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/url/`                                  | `view.ts` turns the URL into a view and back, in one canonical form. `history.ts` is the history policy, a pure function tested as a table. `useView.ts` is the React binding and the navigation actions.     |
| `src/api/`                                  | `client.ts` is the one place that calls `fetch`. Also here: `errors.ts` (plain-language messages and whether to retry), `retry.ts` (backoff), `schemas.ts` (validation), `queries.ts` (query hooks and keys). |
| `src/features/events/`                      | The page, the table, and its virtualization: `virtualWindow.ts` for the math, `useVirtualRows.ts` for the measurements.                                                                                       |
| `src/features/filters/`                     | The search box (debounced), the status radio group, the agent picker, and the removable filter chips.                                                                                                         |
| `src/features/detail/`                      | The detail panel, the JSON viewer, and the tablet drawer.                                                                                                                                                     |
| `src/components/`, `src/hooks/`, `src/lib/` | Small shared pieces: buttons, state messages, the live region, error boundaries, debounce, delayed flags, and cached `Intl` formatters.                                                                       |
| `src/styles/`                               | Design tokens (light and dark) and global rules: focus rings and reduced motion.                                                                                                                              |
| `e2e/`                                      | Playwright specs, plus `mockApi.ts`, a deterministic fake of the API.                                                                                                                                         |

## The decisions that shape the code

**History policy** (`src/url/history.ts`):

- Each filter change pushes a history entry.
- Search edits collapse, so one Back undoes a whole typing burst. No timers are involved: the entry is marked in `history.state`.
- Opening the panel pushes an entry, and switching events while it's open replaces that entry.
- Closing the panel goes Back only if this entry opened it. Otherwise it replaces the entry, because going Back from a deep link would leave the app.

**Network** (`src/api/`): the numbers below come from measuring the API (p50 ~850 ms, 4–9% random 500s).

- Each request gets a 10 s timeout. A timeout and a user cancel are told apart by which signal fired, not by the error's name.
- 5xx responses, network errors and timeouts are retried 3 times, with jittered exponential backoff of about 0.4, 0.8 and 1.6 s.
- Other 4xx responses are never retried (408 and 429 are the exceptions, since they ask for a retry). So a missing event shows "Event not found" after exactly one request.
- `networkMode: 'always'`: the API is on localhost, so `navigator.onLine` says nothing useful about it.

**Paging:**

- Requests use 200 rows per page, the API's maximum. It costs about 13% more latency than 100 rows and halves the round trips.
- More rows load when the footer comes within 1,200 px of view, or when the user presses "Load more" (the keyboard path).
- After a failed page, nothing more loads until the user presses Try again, so there are no request loops.
- There's no background refetch, because it would re-request every loaded page. Refresh reloads page 1.

**Virtualization** (`src/features/events/`):

- It stays a real `<table>`, with two spacer rows standing in for everything off screen, so screen readers keep table navigation.
- `aria-rowcount` and `aria-rowindex` tell assistive tech where each row sits in the full list.
- The row height is measured from a rendered row with `ResizeObserver`, not hard-coded.
- The window only re-renders when the visible range changes, not on every scroll event.

**Keyboard and focus:**

- The list is a single tab stop (roving `tabindex`), and the arrow keys move between rows.
- If the focused row scrolls out of the window and unmounts, focus moves to the scroll container instead of falling to `<body>`, so the next arrow key carries on from the same row.
- The panel focuses its heading when it opens, and hands focus back to the row when it closes.
- On tablets the panel is a native modal `<dialog>`, which brings focus trapping, an inert background and Escape handling. To avoid closing twice, it has exactly one Escape handler.

**Untrusted data:**

- Event payloads contain shell commands, fake tokens and prompt-injection text.
- Everything renders as inert text. There's no `dangerouslySetInnerHTML` (a lint rule enforces this) and no auto-linking.
- Large JSON values are truncated, with a "Show all" button.

## Tests

| Layer      | Where                      | What it covers                                                                                                                                                                                                      |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit       | `src/**/*.test.ts`         | The URL round-trips and the history-policy table. Error classification and the retry rules. Schema leniency. The windowing math, as an invariant over many scroll positions. Formatters and hooks.                  |
| Component  | `*.test.tsx` (jsdom + MSW) | The list states. A failed next page keeps its rows and doesn't loop. Hostile strings render as plain text. Search is debounced into one request. The panel's focus and Escape. A 404 makes exactly one request.     |
| End-to-end | `e2e/` (Chromium)          | Real history: reload, Back/Forward, deep links. Scrolling through 1,000 rows while the DOM stays small. Keyboard focus as rows unmount. Every failure state, on cue. The tablet drawer. axe in light and dark mode. |

The end-to-end tests run against `vite preview`, not the dev server. In development, React StrictMode mounts everything twice and sends every request twice, which would break the request-count assertions. One opt-in test runs against the real API binary (`E2E_REAL_API=1 npm run e2e`) to catch drift between the fake and the real API.
