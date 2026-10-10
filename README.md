# Agent Activity Explorer

My submission for the frontend take-home. The brief is in [ASSIGNMENT.md](ASSIGNMENT.md).

**Start here:**
- [NOTES.md](NOTES.md): what I built, trade-offs, known gaps, and how I used AI.
- [PERF.md](PERF.md): Part B. 15 performance problems, each with its before/after numbers.
- [app/README.md](app/README.md): how the app is put together.

```bash
npm install
npm run dev            # mock API on :4000 + the app on http://localhost:5173
npm run perf-clinic    # Part B page on http://localhost:5174
npm test               # unit and component tests
npm run e2e            # end-to-end and accessibility tests (Playwright)
```

Requires Node 22.22 or newer (see `.nvmrc`). `npm run api` and `npm run app` start the two halves separately.

| Path | What it is |
|---|---|
| `app/` | Part A: the explorer (React, TypeScript, Vite) |
| `perf-clinic/` | Part B: the page, with its performance problems fixed |
| `docs/` | [What I measured about the API](docs/api-observations.md) and [how I worked with AI](docs/AI_WORKFLOW.md) |
| `tools/perf-bench/` | The Part B measurement harness (Playwright + Chrome DevTools Protocol) and its saved results |
| `tools/optimize-images/` | The script that produced the Part B images, plus the originals |
| `bin/`, `scripts/` | The provided mock API binaries and launchers, unchanged except for an added dev launcher and an API probe |
| `CLAUDE.md` | Conventions and guardrails for the AI coding agent |
