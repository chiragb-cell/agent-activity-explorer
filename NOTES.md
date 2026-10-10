# Notes

**Run it:** `npm install`, then `npm run dev` (app on http://localhost:5173, API on :4000). Tests: `npm test` (102) and `npm run e2e` (29, Playwright + axe). Part B: [PERF.md](PERF.md).

## What I built

- **Core, all four:**
  - A table that pages through the whole dataset.
  - Search, agent and status filters kept in the URL, so refresh, Back/Forward and shared links all work.
  - A linkable detail panel that Escape closes.
  - Clear loading, slow, retrying, empty and error states.
- **Polish, all five:** keyboard navigation, a modal drawer at tablet widths, axe-clean in light and dark, system dark mode, and reduced motion.
- **Stretch:** a **hand-built virtualized list** (50,000 rows is where this screen breaks) and **tests** for what's most likely to break. I skipped live mode and the chart so I could do these two properly.
- **Part B:** 15 fixes, one commit each, each measured before and after.
- **Vite, not Next.js:** it's a client-only tool over a CORS-enabled API, with all state in the URL. Server rendering would add a server for nothing.

## How I worked

1. **Tested the API before designing for it** ([docs/api-observations.md](docs/api-observations.md)):
   - ~850 ms at p50;
   - random 500s on 4–9% of requests;
   - a keyset cursor, not the offset the brief's example suggests.

   Those numbers set the page size, the 10 s timeout, the retries (3, never for 404s) and the 2 s "still loading" note.
2. **Safety net before features:** strict TypeScript, lint with accessibility rules, formatting, tests and CI from day one.
3. **Small slices, each run in a real browser,** fixing runtime issues as they surfaced:
   - On Windows, the dev script left the API running after exit.
   - React's dev-only double mount doubled requests, so end-to-end tests run on the production build.
4. **Then broke it on purpose:** a stopped API, forced 500s, slow and empty responses, a failed next page, dead links, keyboard-only use. Each case is now a test.
5. **Part B the same way:**
   - Ran each user journey and read the code behind the slow ones.
   - Measured a baseline with a harness: real Chrome, 4× CPU, median of 3.
   - Fixed one cause per commit, re-measuring each time and checking behavior against the original.

## Trade-offs and next steps

- **No automatic refetch.** It would re-request every loaded page from a flaky API, so Refresh reloads page 1 instead.
- **Old rows stay, dimmed and inert, while new filters load,** instead of flashing a skeleton.
- **A real `<table>` with spacer rows.** It keeps screen-reader table navigation, at the cost of one-line, fixed-height rows.
- **With more time:**
  - live mode, with a "new events" pill that never moves the list;
  - the histogram, with drag-to-filter;
  - end-to-end tests in WebKit and Firefox.

## Known gaps

- The brief's clone URL returns 404, so commit 1 is the emailed zip, exactly as provided.
- Only tested in Chrome. Phones below 768 px work but weren't designed for.
- Events from `/stream` show up only after Refresh.

## How I used AI

**Claude Code (Claude Opus 5.5)** was my pair programmer. It wrote most of the code, tests and docs from a plan I approved, and every commit carries its `Co-Authored-By` trailer. I held it to team standards:

- **Human ownership:** I set the scope, approved the plan, reviewed at checkpoints, and can walk through any part.
- **Context and limits up front:** [CLAUDE.md](CLAUDE.md) sets the rules:
  - verify before claiming;
  - small commits, never squashed;
  - every new dependency justified.
- **Verification over trust:** nothing counted as done until types, lint, tests and CI passed. Every perf claim is measured.
- **Security:**
  - Event data contains prompt-injection text, so payloads are treated as untrusted.
  - No secrets go in prompts or the repo.
  - CI actions are pinned to commit SHAs, with read-only permissions.
- **Where it was wrong, and what caught it:**
  - It assumed offset paging. Probing the API caught it.
  - It used a renamed MSW option. `tsc` flagged it.
  - It wrote an idle-callback fallback that never stopped. Review caught it.
  - It left the lockfile out of a commit. CI caught it, and the fix went in as a new commit, with no history rewrite.

Details are in [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md).
