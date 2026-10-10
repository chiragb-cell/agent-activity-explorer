# PERF.md: Perf Clinic

I found and fixed **15 distinct problems** in `perf-clinic/`. Each one is its own commit, re-measured before moving on to the next. The page looks and behaves the same, and every fix was checked against the original. Three fixes go a little further, and their entries say so: a search bug, a clipped card, and a layout-shift risk.

| What a user does | Measure | Original | Fixed |
|---|---|---:|---:|
| Types "billing" into search | Slowest keystroke to paint | 4,112 ms | **32 ms** |
| | Main thread blocked while typing | 10,182 ms | **93 ms** |
| …as a returning user (#9) | Slowest keystroke to paint | 6,208 ms | **160 ms** |
| Scrolls the page | Slowest 5% of frames (p95) | 389 ms | **~28 ms** (28–48 ms across runs) |
| | Forced layouts per scroll event | 11 | **0.67** |
| Opens the page (cold, 10 Mbps) | First Contentful Paint | 5,664 ms | **268 ms** |
| | Largest Contentful Paint | 8,172 ms | **732 ms** |
| | Bytes downloaded | 6,464 KB | **188 KB** |
| Leaves it idle | Main-thread time per second | 854 ms (85%) | **0.7 ms** |
| Moves the pointer over the list | Script per mouse move | 10.2 ms | **0.4 ms** |
| Resizes the window 10× | Layouts | 13,183 | **40** |
| Opens and closes the ticker 10× | Intervals still running afterwards | 10 | **0** |

All at 4× CPU throttling, median of 3 runs (`tools/perf-bench/results/before.json` vs `after.json`). Frame timing is the noisiest measure: the scroll figure is quoted with its spread over 5 runs.

## How I found and measured them

The same method for every problem:

1. **Use the page like a user.** I went through every journey it offers: a cold load, typing in search, scrolling, hovering the list, resizing, leaving it idle, and toggling the live ticker.
2. **Measure before changing anything.** A small harness (below) records each journey the same way every time, so the baseline and every later number are comparable.
3. **Find the cause in the code.** I started from the slow journey's event handler, then predicted which number a fix should move.
4. **Change one thing, then re-measure.** Each fix is its own commit, measured against the commit just before it. If the predicted number doesn't move, the diagnosis was wrong.
5. **Check that nothing else changed.** Every fix was compared against the original page: search results, fitted font sizes, animation positions, "New" badges, card heights, and preview text.
6. **Order by impact:** how bad it is, times how often it happens, times how many users hit it.

- **Harness:** `tools/perf-bench` is a small Playwright + Chrome DevTools Protocol script, with no framework, that drives real Chrome (v154) through each journey these problems affect:
  - a cold load
  - typing "billing" into search
  - wheel-scrolling
  - moving the pointer over the list
  - resizing
  - leaving the page idle
  - toggling the live ticker

  It reads the browser's own numbers: LCP, CLS, long tasks, and keystroke latency through `PerformanceObserver` (Event Timing), plus layout, style, and script time, DOM nodes, and listeners through `Performance.getMetrics`.
- **Conditions:**
  - **4× CPU throttling.** That's a mid-range laptop that's also doing other work; on a fast machine some of these problems hide.
  - 1366×800 window.
  - A fresh profile for every run.
  - **Median of 3 runs.**
  - For load, the network is throttled to 10 Mbps with 40 ms RTT.
  - One extra "returning user" scenario starts with 20,000 viewed ids already stored (see #9).
- **Attribution:** a "before" number is from the commit *just before* that fix, so one fix doesn't get credit for another. The original page is commit `80e7357`, served on another port. Raw results for every step are in `tools/perf-bench/results/`.
- **Reproduce:**
  - Run `npm run perf-clinic`, then `node tools/perf-bench/bench.mjs --url http://localhost:5174 --label mine`.
  - Compare two runs with `npm run bench:compare -- tools/perf-bench/results/before.json tools/perf-bench/results/mine.json`.
- **Seeing it in DevTools:** the harness reads the same data as the DevTools panels, through the DevTools Protocol. To see a problem by hand, open the original page in Chrome with CPU throttling at 4×. Each problem shows up in:
  - the Performance panel: long tasks, "Forced reflow" warnings and Bottom-Up;
  - the Performance monitor: idle layouts and listener counts;
  - Network: bytes;
  - Coverage: unused CSS.

  Traces saved with `--trace` open directly in the Performance panel.

## Problems, ordered by impact on the user (highest first)

### 1. Typing in search froze the page for seconds per keystroke
- **Symptom:** every character typed into "Search tool calls" froze the page. Keys appeared late, and the results jumped around afterwards.
- **How I found it:**
  - Typing "billing" at 4× CPU, the harness measured the worst keystroke at **4,112 ms** (Event Timing), with one long task per key.
  - The `input` handler leads straight to `search()`, which serializes and re-sorts all 100,000 events on every key.
  - Changing only that function took the worst keystroke to 1,440 ms, which confirmed it.
- **Root cause:** in `js/app.js`, `search()` ran `JSON.stringify(event).toLowerCase()` on **all 100,000 events** for every keystroke. It then re-sorted the matches with `new Date(b.timestamp) - new Date(a.timestamp)`, which allocates two `Date` objects per comparison: about 3.4 million per keystroke. Nothing was debounced. `JSON.stringify` also matched key names, so searching "tool" matched every event.
- **Fix** (`ef5b5de`, then `f111042`):
  - Sort once at startup. UTC ISO-8601 strings sort chronologically, so no `Date` objects are needed.
  - Search a lowercase index of the *values*, using one `String#includes` pass. Filtering keeps the order, so there's no re-sort.
  - Render after a 150 ms pause in typing.
  - Build the index in idle-time slices after load, so the first keystroke doesn't pay the 711 ms it takes.

  Results are identical to the original for every query I tried. The one intended difference: "tool" now matches 0 events instead of all 100,000.
- **Before / after:**
  - Worst keystroke **4,112 → 1,440 ms** from the algorithm change alone. **The first search fell from 711 → 25 ms** once the index was built in idle time.
  - With every fix applied: **4,112 → 32 ms**, and main-thread blocking while typing fell **10,182 → 93 ms**.

### 2. Scrolling stuttered: a 100,000-event scan on every scroll event
- **Symptom:** scrolling the page was jerky, with frames that took nearly half a second.
- **How I found it:**
  - While wheel-scrolling, the p95 frame was 389 ms, and 63 scroll events cost 14.3 s of script (about 228 ms each).
  - The scroll handler, `onScroll`, filters all 100,000 events on every event, just to produce one label.
  - Precomputing the counts dropped script time to 259 ms, which confirmed it.
- **Root cause:** to show "N calls that minute", `onScroll()` filtered all 100,000 events on *every* scroll event. It created a `Date` per event just to read back the UTC string it was built from. That's about 228 ms of script per scroll event at 4× CPU.
- **Fix** (`5941021`): count calls per minute once, into a `Map` (pre-built in idle time); each scroll event does an O(1) lookup. The label text is identical at every scroll position checked.
- **Before / after:** p95 frame time **389 → 34.7 ms**, janky frames (over 50 ms) **40 → 1**, script time **14,285 → 259 ms** over 63 scroll events.

### 3. The hero image delayed the main content by about 5 seconds
- **Symptom:** a blank hero area that filled in slowly. The page's largest element arrived last.
- **How I found it:**
  - A cold load downloads 6.4 MB, and 4.27 MB of that is one file: `hero.png`.
  - The hero is the page's largest element, so it sets Largest Contentful Paint (5,076 ms at 10 Mbps).
  - The `<img>` had no `width`/`height`. Measured CLS was 0 anyway, so I tested the bad case (below).
- **Root cause:** `assets/hero.png` was a 1700×950 truecolor PNG (4.27 MB) served to every screen, with no `width`/`height`.
  - Measured CLS was 0, but only because Chrome reads PNG dimensions from the first bytes. When the hero's request arrives late (I delayed it by 2 s to simulate a queued or slow image), **CLS was 0.431**, rated "poor".
- **Fix** (`fc25793`):
  - A `<picture>` with AVIF and WebP at 640, 1024, 1440, and 1700 px, plus a JPEG fallback (generated by `tools/optimize-images`).
  - `width`/`height` attributes to reserve the space.
  - `fetchpriority="high"`, because it is the LCP element.

  A side-by-side crop shows the film grain preserved.
- **Before / after:**
  - LCP **5,076 → 696 ms**.
  - The hero on a 1366 px laptop: **4,171 KB → 90 KB** (161 KB on 2× screens).
  - CLS with a late hero: **0.431 → 0**.

### 4. The page kept the CPU 85% busy while sitting idle
- **Symptom:** with nothing happening on screen, fans spin up and the battery drains. Everything else also has less main thread to work with.
- **How I found it:**
  - Left untouched, the page still ran 143 layouts per second and kept the main thread busy for 854 ms of every second.
  - The only thing moving was the alerts marquee, and its keyframes animate `left`, a layout property.
  - Switching it to `transform` brought layouts to 0 per second, which confirmed it.
- **Root cause:** the alerts marquee animated `left` (`css/app.css`, `@keyframes alerts-scroll`). That's a layout property, so the main thread recalculated style and layout every frame, forever.
- **Fix** (`d573a35`): animate `transform: translateX()`, which the compositor runs off the main thread.
  - Container query units (`cqw`) keep the exact path of `left: N%`; the position is pixel-identical at 0, 25, 50, 75, and 100% of the animation. Plain `translateX(%)` would have been relative to the track itself.
  - It also respects `prefers-reduced-motion`.
- **Before / after:**
  - Idle layouts **143/s → 0/s**; main-thread time **854 → 1.4 ms per second**.
  - Knock-on effect: the search index now finishes in idle time before the user types, so the worst keystroke fell **760 → 168 ms**.

### 5. The scroll handler also forced a layout for every row
- **Symptom:** remaining scroll jank after #2, and heavier jank on slower devices.
- **How I found it:**
  - Even after #2, scrolling caused 7.21 layouts per scroll event. More than one layout per event means the code is forcing them.
  - `onScroll` alternates a class write with a `getBoundingClientRect` read for each of 200 rows, and rewrites the header's padding on every event.
  - Its `wheel` and `touchstart` listeners were registered without `{ passive: true }`.
- **Root cause:** for each of 200 rows, `onScroll` removed a class (a write) and then called `getBoundingClientRect` (a read), forcing a synchronous layout per row. It also:
  - rewrote the header's `padding-block`, which re-laid out the page below it;
  - animated the progress bar's `width`;
  - used non-passive `wheel`/`touchstart` listeners, so scrolling waited for JavaScript.
- **Fix** (`259e9ba`):
  - An `IntersectionObserver` reports rows crossing the 30–60% reading band, so there are no geometry reads from our code. Moving the band's top down by one row height keeps the original rule exactly: a row is highlighted while its top edge is in the band. I checked the same rows and the same label at four positions.
  - The remaining work runs once per frame, reads before it writes, and touches only `transform` and classes:
    - the progress bar uses `scaleX`;
    - the header compacts once, via a class;
    - the focus accent uses an inset `box-shadow`.
  - The listeners are passive.
- **Before / after:** layouts per scroll event **7.21 → 0.67**, long tasks **52 → 0 ms**, p95 frame **34.7 → 21 ms**, janky frames **1 → 0**.

### 6. A data script blocked first paint
- **Symptom:** a white screen while the page loads.
- **How I found it:**
  - On a cold load, nothing painted until 1,768 ms.
  - Ahead of the body sits `config.js`: a classic `<script>` in `<head>` that builds 100,000 events. The parser has to download and run it before anything can render.
  - Deferring it moved first paint to 788 ms, which confirmed it.
- **Root cause:** `config.js`, which builds the 100,000 mock events, was a classic `<script>` in `<head>`. The parser waited for it to download *and run* before anything could render.
- **Fix** (`b4ea2f8`): both scripts are `defer` in `<head>`. The HTML parses and paints first, the scripts are discovered early, and they still run in order.
- **Before / after:** First Contentful Paint **1,768 → 788 ms**.
  - TBT moved 0 → 518 ms, but that isn't new work: total long-task time is unchanged (~1 s). TBT only counts work *after* first paint, and the data is now built after the page is already visible. See "Not changed" below.

### 7. A 327 KB unused stylesheet blocked rendering
- **Symptom:** a slow first paint, and a large download for nothing.
- **How I found it:**
  - `css/theme.css` is a 327 KB stylesheet that blocks rendering, but none of the page's classes appear in it, and it has no element selectors.
  - To prove it was unused before deleting it, I compared the computed styles of all 1,772 elements with and without it, with animations frozen. They were identical.
- **Root cause:** a utility library (8,603 rules) linked in `<head>`. Every stylesheet there blocks rendering until it has downloaded and been parsed.
- **Fix** (`56eeed7`): removed it.
- **Before / after:** First Contentful Paint **788 → 280 ms**; **−319 KB** and one fewer request.

### 8. Fitting the summaries forced a layout per measurement
- **Symptom:** typing and resizing felt sticky, even after #1.
- **How I found it:**
  - Typing "billing" caused 2,722 layouts.
  - `fitSummaries` writes a font size and then reads `scrollWidth`, up to 7 times for each of 200 cells. Every read after a write forces a layout.
  - Batching the reads and writes cut it to 339 layouts, which confirmed it.
- **Root cause:** for each of 200 cells, it set a font size and then read `scrollWidth`, in a loop of up to 7 times. Every read after a write forces the browser to redo layout ("layout thrashing"). That's up to ~1,400 layouts per render, on every search and every `resize` event.
- **Fix** (`22a64e9`):
  - One write pass (reset), one read pass (a single layout), one write pass.
  - Text width scales linearly with font size, so a single measurement gives the size that fits. 599 of 600 cells come out identical to the old loop; one is 0.5 px smaller and still fits.
  - Resize work runs at most once per frame.
- **Before / after:**
  - Typing: layouts **2,722 → 339**; results show **974 → 392 ms** after the last key.
  - 10 resizes, against the original: layouts **13,183 → 328**.

### 9. Storage writes grew with every event the user had seen
- **Symptom:** search got slower the longer someone used the page.
- **How I found it:**
  - In `rememberViewed`, `localStorage.setItem` sits *inside* the per-row loop.
  - The cost grows with use, so I added a "returning user" journey with 20,000 stored ids. There, the worst keystroke was 6,208 ms, against 4,112 ms on a fresh profile.
- **Root cause:** every render parsed the whole "viewed" list from `localStorage`, scanned it with `Array#includes` for each row, and then called the synchronous `setItem` 200 times, re-serializing the growing list each time.
- **Fix** (`89610e2`):
  - Keep the ids in a `Set`, read from storage once, with O(1) lookups.
  - Write once per render, in idle time.
  - Catch quota and disabled-storage errors.

  "New" badges behave identically, including after a reload.
- **Before / after** (returning user with 20,000 viewed ids, typing "billing"):
  - Worst keystroke **1,912 → 864 ms**; blocking **2,836 → 863 ms**.
  - Against the original: **6,208 → 864 ms** and **18,675 → 863 ms**.
  - On a fresh profile the list is tiny, so the gain there is about 20%.

### 10. The hover preview searched every event on every mouse move
- **Symptom:** moving the pointer over the list made the page sluggish.
- **How I found it:**
  - Moving the pointer over the list cost 11.8 ms of script per mouse move.
  - `showPreview` runs `ACTIVITY.find()` over 100,000 events to get text that's already in the row.
- **Root cause:** on every `mousemove` (dozens per second), `showPreview` searched all 100,000 events for the hovered row's summary, which was already rendered in that row. It then moved the preview with `top`/`left`, which triggers layout.
- **Fix** (`5ca1ee4`):
  - Read the summary from the row itself, and only when the pointer enters a different row.
  - Move the preview with `transform`.
  - Update at most once per frame.
- **Before / after:** script per mouse move **11.8 → 0.41 ms**; long tasks **203 → 0 ms**; layouts **100 → 13** per 100 moves.

### 11. Avatars were 44× bigger than displayed, and downloaded twice
- **Symptom:** 1.9 MB of images for twelve 48 px icons.
- **How I found it:**
  - The 12 avatar requests add up to 1.9 MB: 320×320 PNGs shown at 48×48.
  - An `md5` check showed that `agent-07…12.png` are byte-identical copies of `agent-01…06.png`.
- **Root cause:** 320×320 PNGs at ~160 KB each, shown at 48×48, with no `width`/`height`. Twelve files held six pictures.
- **Fix** (`8384574`):
  - Six 96×96 WebP files (2× density), at ~0.4 KB each.
  - `width`/`height`, plus lazy loading and async decoding.
  - `index % 6` picks the very same picture that `index % 12` did. Visually identical at 2×.
- **Before / after:** avatars **12 requests / 1,890 KB → 6 / 2 KB**. Page load event **2,764 → 1,268 ms**.

### 12. Text was invisible while the web font loaded
- **Symptom:** the headline and labels appeared late on a cold load.
- **How I found it:**
  - On a cold load, the hero headline painted 1.5 s in, long after the page's first paint.
  - The `@font-face` rule has no `font-display`, so Chrome hides the text until the font arrives.
- **Root cause:** the `@font-face` had no `font-display`, so Chrome hid the text until the font arrived. Here the text then also waited behind the deferred data script.
- **Fix** (`3e04b88`): `font-display: swap`.
  - I also measured `<link rel="preload">` for the font, which is the usual advice. **It made first paint about 4× later here** (264 → 1,272 ms, reproduced in `results/exp-font-swap-plus-preload.json`), so I left it out. Chrome briefly treats a preloaded font as render-blocking; meanwhile parsing finished, and the first frame got pushed behind the data script.
- **Before / after:** the hero headline's first paint went **1,504 → 300 ms**, and First Contentful Paint was unchanged.

### 13. The live ticker leaked intervals, listeners, and DOM nodes
- **Symptom:** after opening and closing "Show live calls" a few times, the page kept working in the background, and memory kept growing.
- **How I found it:**
  - I opened and closed the ticker 10 times. Afterwards, 10 intervals were still running, there were 11 extra listeners, and DOM nodes kept growing while it was closed.
  - In the code, `openTicker` throws away the `setInterval` id and never removes its listeners.
- **Root cause:**
  1. The interval was never cleared, so every close left an interval writing rows into a detached list.
  2. The `resize` and `keydown` listeners were added on every open and never removed.
  3. `renderedTickerRows` cached a DOM node for every event shown and never evicted any. With random picks from 100,000 events, it only ever grew.
- **Fix** (`6844dd7`): `clearInterval` on close, one `AbortController` for both listeners, and rows built fresh. Opening it twice is a no-op.
- **Before / after** (10 open/close cycles, then closed):
  - Intervals still alive: **10 → 0**.
  - Callbacks while closed: **20/s → 0**.
  - Extra listeners: **11 → 0**.
  - DOM nodes retained: **1,477 per 5 s → 0**.

### 14. Card heights were equalized in JavaScript with O(n²) forced layouts
- **Symptom:** janky resizing, and a clipped card.
- **How I found it:**
  - Ten window resizes caused 280 layouts.
  - `equalizeCardHeights` resets a height and then reads every card's geometry, for every card.
  - In the CSS, `.agent-grid` had `align-items: start`, which opts *out* of the stretching that the JavaScript then rebuilt.
  - Checking the heights at 900 px also turned up a clipped card.
- **Root cause:** the function reset each card's height, then read `offsetTop`/`offsetHeight` of every card, for every card. It ran on each of the 24 image loads and on every resize. It also measured before the web font loaded and never re-measured, so at 900 px the "sales-researcher" card clipped its last line (271 px of content in a 268 px card).
- **Fix** (`1e8a9d8`): delete the JavaScript. Grid's default `align-items: stretch` makes every card in a row as tall as the tallest, and `min-height: 220px` keeps the floor. Heights are identical at 1366 and 1700 px, and the clipping is gone.
- **Before / after** (10 resizes): layouts **280 → 40**, style recalculations **310 → 70**, script **58 → 29 ms**. Total layout time didn't change (~770 ms); what's left is the browser's own relayout on resize.

### 15. A new date formatter was created for every row
- **Symptom:** a smaller cost inside every render and every ticker tick.
- **How I found it:**
  - `formatTime` calls `toLocaleTimeString(locale, options)`, which builds a new formatter on every call.
  - I timed 200 calls directly.
- **Root cause:** `toLocaleTimeString(locale, options)` constructs a new `Intl.DateTimeFormat` on every call: 200 times per render.
- **Fix** (`3871380`): one shared formatter, with byte-identical output.
- **Before / after:** 200 calls take **40.2 → 1.3 ms**.

## Noticed, but not changed

- **The data is still generated on the main thread** after first paint (~1 s at 4× CPU, so TBT is about 0.5 s). That's the mock "backend". Building it in a Web Worker, or shipping precomputed JSON, would remove it. I left it alone because it's data setup, not page behavior.
- **The search index trades memory for speed:** about 25 MB of lowercase strings, built lazily. An n-gram index, or searching only the fields that matter, would cut that if memory mattered more than latency.
- **The server** (`scripts/serve-perf-clinic.js`, outside `perf-clinic/`) sends no compression or cache headers. Gzip or Brotli and long-lived caching for hashed assets would help repeat visits.
- **The font could be subset to Latin** (65 KB → ~20 KB), and a fallback with `size-adjust` would reduce the small shift when it swaps in.
