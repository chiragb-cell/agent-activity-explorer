# Notes

**Run it:** `npm install`, then `npm run dev` (API on :4000, app on http://localhost:5173). `npm test` runs 102 unit and component tests; `npm run e2e` runs 29 Playwright tests with axe. Part B is in [PERF.md](PERF.md).

## What I built

- **Core, all four:**
  - A table that pages through the whole dataset, on scroll or with "Load more".
  - Search, agent and status filters kept in the URL. Refresh, Back/Forward and copied links work, and a typing burst is one history entry.
  - A URL-linked detail panel. Escape closes it and returns focus to its row.
  - Loading, slow, retrying, empty, no-match and failed states, each in plain words.
- **Polish, all five:** keyboard navigation (arrows or j/k, Home/End, PgUp/PgDn, Enter, Esc, `/`), a modal drawer at tablet widths, axe-clean in light and dark, system dark mode, and reduced motion.
- **Stretch:** a **hand-built virtualized list**, because 50,000 rows is where this screen breaks. Plus **tests** for what's most likely to break: URL and history rules, failure paths, the windowing math, and focus across rows that unmount. I skipped live mode and the chart to do these two properly.
- **Part B:** 15 fixes, one commit each, each measured before and after with a small Playwright + DevTools Protocol harness.
- **Vite, not Next.js:** a client-only tool over a CORS-enabled API, with all state in `location.search`. Server rendering would add a server for nothing.

## Trade-offs

- **Measured the API first** ([docs/api-observations.md](docs/api-observations.md)). It answers in ~850 ms at p50, returns random 500s on 4–9% of requests, and uses a keyset cursor. Those numbers set:
  - 200 events per page and a 10 s timeout.
  - Three retries with backoff for 5xx, timeouts and network errors; none for 404s or other client errors.
  - A "still loading" note at 2 s.
- **No automatic refetch.** It would re-request every loaded page, and at that failure rate it would often fail partway. Refresh reloads page 1.
- **While new filters load, the old rows stay,** dimmed and inert, instead of flashing a skeleton.
- **A real `<table>` with spacer rows,** so screen readers keep table navigation. The cost is that every row must be the same height, so rows stay on one line. That height is measured, not hard-coded.
- **Few dependencies:** TanStack Query and zod at runtime, no router, no UI kit.

## With more time

- Live mode: a "new events" pill that never moves the list under a reader.
- The histogram, with drag-to-filter.
- E2E runs in WebKit and Firefox.

## Known gaps

- The brief's clone URL returns 404, so commit 1 imports the starter as provided.
- Only tested in Chrome/Chromium.
- Phones below 768 px work but weren't designed for.
- Events from `/stream` appear only after Refresh.
- PERF.md has no screenshots. The harness can save DevTools traces.

## How I used AI

**Claude Code (Claude Opus 5.5)** was my pair programmer. It wrote most of the code, tests and docs, and every commit carries its `Co-Authored-By` trailer.

- **I made the calls:** scope and order, virtualization over live mode, how history behaves, and the stack. I reviewed the work at three checkpoints.
- **Guardrails:** [CLAUDE.md](CLAUDE.md) holds the conventions. One rule mattered here: event data contains prompt-injection text, so the agent treats payloads as untrusted and only summarizes their shapes.
- **Verified, not trusted:** nothing was done until types, lint, tests and CI passed, and every perf claim is measured.
- **Where it was wrong:**
  - It assumed offset paging from the brief's sample. Probing the API showed a keyset cursor.
  - It used an MSW 2 option that MSW 3 silently ignores. `tsc` caught it.
  - Its dev script left the API process running on Windows. Testing the shutdown path caught it.
  - Its idle-callback fallback would have looped forever. Review caught it.
  - It left the lockfile out of a commit, so CI was red for three commits. I fixed it with a new commit instead of rewriting history.
