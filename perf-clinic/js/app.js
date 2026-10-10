const { pageSize, tickerIntervalMs, tickerVisibleRows, storageKey } = window.APP_CONFIG;

const grid = document.getElementById('agents');
const searchInput = document.getElementById('search');
const resultsList = document.getElementById('results');
const resultsCount = document.getElementById('results-count');
const topbar = document.querySelector('.topbar');
const backToTop = document.getElementById('back-to-top');
const progress = document.getElementById('read-progress');
const tickerToggle = document.getElementById('ticker-toggle');
const preview = document.getElementById('row-preview');
const scrollContext = document.getElementById('scroll-context');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* PERF #13: toLocaleTimeString(locale, options) builds a new Intl formatter on every call:
   ~40 ms for one render's 200 rows at 4x CPU. One shared formatter: ~1.3 ms, same output. */
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

function formatTime(iso) {
  return timeFormat.format(new Date(iso));
}

function countByAgent(events) {
  const counts = {};
  events.forEach((event) => {
    counts[event.agent] = (counts[event.agent] || 0) + 1;
  });
  return counts;
}

function renderAgents() {
  const counts = countByAgent(window.ACTIVITY);
  grid.innerHTML = window.AGENTS.map((agent, index) => {
    // PERF #11: 6 unique 96x96 WebP avatars (~0.4 KB each) instead of 12 PNGs of ~160 KB
    // at 320x320 shown at 48x48; agent-07..12 were byte-identical copies of agent-01..06,
    // so index % 6 picks the very same picture index % 12 did.
    const image = 'assets/agents/agent-' + String((index % 6) + 1).padStart(2, '0') + '.webp';
    return (
      '<article class="agent-card">' +
      '<img class="agent-avatar" src="' + image + '" width="48" height="48" loading="lazy" decoding="async" alt="">' +
      '<h3>' + escapeHtml(agent.name) + '</h3>' +
      '<p class="agent-owner">' + escapeHtml(agent.owner) + '</p>' +
      '<p class="agent-description">' + escapeHtml(agent.description) + '</p>' +
      '<p class="agent-count">' + (counts[agent.name] || 0).toLocaleString() + ' calls today</p>' +
      '</article>'
    );
  }).join('');
}

/* PERF #6: equalizeCardHeights gave cards in a row equal heights by reading offsetTop and
   offsetHeight of every card for every card (O(n²)), interleaved with height writes, so
   each read forced a layout. It ran on each of the 24 image loads and on every resize
   event. CSS grid already stretches items in a row to the tallest one (align-items:
   stretch is the default; the stylesheet had opted out), so the JavaScript is gone and
   .agent-card has min-height: 220px instead. Same heights, zero script. */

/* PERF #3: localStorage is synchronous, and every render parsed the whole "viewed" list,
   scanned it with includes() (O(n) per row), then called setItem 200 times, once per row,
   re-serialising the ever-growing list each time. Now the list lives in memory as a Set
   (O(1) lookups), is read from storage once, and is written once per render, when the
   browser is idle. Storage failures (quota, private mode) no longer break rendering. */
const viewed = readViewed();
let viewedSavePending = false;

function readViewed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
  } catch {
    return new Set();
  }
}

function rememberViewed(items) {
  for (const item of items) viewed.add(item.id);
  if (viewedSavePending) return;
  viewedSavePending = true;
  const save = () => {
    viewedSavePending = false;
    try {
      localStorage.setItem(storageKey, JSON.stringify([...viewed]));
    } catch {
      // Out of quota or storage disabled: "New" badges just won't persist across visits.
    }
  };
  if ('requestIdleCallback' in window) requestIdleCallback(save, { timeout: 2000 });
  else setTimeout(save, 500);
}

/* PERF #1: every keystroke serialised all 100,000 events with JSON.stringify and re-sorted
   them with a comparator that allocated two Date objects per comparison (~3.4 million per
   keystroke). Now the events are sorted once (ISO-8601 UTC strings sort chronologically,
   so no Dates), the lowercase search text is built once on the first search, and a search
   is a single pass of String#includes. Filtering preserves the order, so no re-sort. */
const newestFirst = window.ACTIVITY.slice().sort((a, b) =>
  a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
);
// Values only: JSON.stringify also matched key names, so "tool" or "agent" matched everything.
function searchText(event) {
  return [event.id, event.timestamp, event.agent, event.tool, event.status, event.latencyMs, event.summary]
    .join(' ')
    .toLowerCase();
}

// The index takes ~700 ms to build at 4x CPU, so it is built in small slices while the
// browser is idle after load, instead of stalling the user's first keystroke. If they
// search before it is done, the rest is built on the spot.
const searchTexts = [];
// Safari has no requestIdleCallback: fall back to short timer slices with an 8 ms budget
// (measured from when the slice runs, not from when it was scheduled).
const whenIdle =
  window.requestIdleCallback ||
  ((callback) =>
    setTimeout(() => {
      const start = performance.now();
      callback({ timeRemaining: () => Math.max(0, 8 - (performance.now() - start)) });
    }, 50));

function buildSearchTexts(deadline) {
  while (searchTexts.length < newestFirst.length && deadline.timeRemaining() > 1) {
    searchTexts.push(searchText(newestFirst[searchTexts.length]));
  }
  if (searchTexts.length < newestFirst.length) whenIdle(buildSearchTexts);
}
whenIdle(buildSearchTexts);

function search(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return newestFirst;
  while (searchTexts.length < newestFirst.length) {
    searchTexts.push(searchText(newestFirst[searchTexts.length]));
  }
  const matches = [];
  for (let i = 0; i < newestFirst.length; i++) {
    if (searchTexts[i].includes(needle)) matches.push(newestFirst[i]);
  }
  return matches;
}

function renderResults(query) {
  const matches = search(query);
  const page = matches.slice(0, pageSize);
  resultsCount.textContent = matches.length.toLocaleString() + ' matching tool calls';
  resultsList.innerHTML = page.map((event) => {
    const isNew = !viewed.has(event.id);
    return (
      '<li class="result-row status-' + event.status + '" data-id="' + event.id + '" data-minute="' + event.timestamp.slice(11, 16) + '">' +
      '<span class="result-time">' + formatTime(event.timestamp) + '</span>' +
      '<span class="result-agent">' + escapeHtml(event.agent) + '</span>' +
      '<span class="result-tool">' + escapeHtml(event.tool) + '</span>' +
      '<span class="result-status">' + event.status + '</span>' +
      '<span class="result-latency">' + event.latencyMs + ' ms</span>' +
      '<span class="result-summary">' + escapeHtml(event.summary) + '</span>' +
      (isNew ? '<span class="badge-new">New</span>' : '') +
      '</li>'
    );
  }).join('');
  fitSummaries();
  observeRows();
  rememberViewed(page);
}

/* PERF #2: forced synchronous layout. Each cell set a font size and then read scrollWidth,
   so the browser had to redo layout before every read: up to 7 times per cell, 200 cells
   per render, on every search and every resize event. Now there is one write pass (reset),
   one read pass (a single layout) and one write pass. Text width scales linearly with font
   size, so the size that fits comes from one measurement instead of trial and error. */
function fitSummaries() {
  const cells = Array.from(resultsList.querySelectorAll('.result-summary'));
  cells.forEach((cell) => {
    cell.style.fontSize = '';
  });
  const ratios = cells.map((cell) => cell.clientWidth / cell.scrollWidth);
  cells.forEach((cell, i) => {
    if (ratios[i] < 1) cell.style.fontSize = Math.max(11, Math.floor(28 * ratios[i]) / 2) + 'px';
  });
}

/* PERF #5: the scroll handler ran on every scroll event and, for each of 200 rows, removed
   a class (a write) and then called getBoundingClientRect (a read), forcing a synchronous
   layout per row. It also rewrote the header's padding (re-laying out the page below it)
   and animated the progress bar's width.

   Now an IntersectionObserver tells us which rows cross the reading band (30-60% of the
   viewport), with no layout reads on our side; the remaining scroll work runs at most
   once per frame, reads before it writes, and only touches compositor-friendly
   properties (transform) or toggles classes. */
let focusObserver = null;

function observeRows() {
  if (focusObserver) focusObserver.disconnect();
  const rows = resultsList.querySelectorAll('.result-row');
  if (!rows.length) return;
  // Same rule as before: a row is "in focus" while its *top edge* is between 30% and 60%
  // of the viewport. An observer reports any overlap, so the band's top is moved down by
  // one row height, which turns "overlaps the band" into exactly "top edge inside it".
  // (Rows all have the same height; this is recomputed on every render and resize.)
  const rowHeight = rows[0].offsetHeight;
  const top = Math.round(window.innerHeight * 0.3 + rowHeight);
  const bottom = Math.round(window.innerHeight * 0.4);
  focusObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) entry.target.classList.toggle('in-focus', entry.isIntersecting);
      updateScrollContext();
    },
    { rootMargin: '-' + top + 'px 0px -' + bottom + 'px 0px' },
  );
  rows.forEach((row) => focusObserver.observe(row));
}

function updateScrollContext() {
  const focused = resultsList.querySelector('.in-focus');
  scrollContext.textContent = focused
    ? focused.dataset.minute + ' UTC · ' + callsInMinute(focused.dataset.minute) + ' calls that minute'
    : '';
}

let scrollFrame = 0;

function onScroll() {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollChrome);
}

function updateScrollChrome() {
  scrollFrame = 0;
  // Reads first...
  const scrolled = window.scrollY;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const pastFirstScreen = scrolled > window.innerHeight;
  // ...then writes, so nothing in between forces another layout.
  progress.style.transform = 'scaleX(' + (max > 0 ? scrolled / max : 0) + ')';
  topbar.classList.toggle('topbar-raised', scrolled > 8);
  backToTop.classList.toggle('visible', pastFirstScreen);
}

/* PERF #4: "calls that minute" was recomputed on every scroll event by filtering all
   100,000 events and allocating a Date for each (new Date(..).toISOString() just to read
   back the same UTC string). The counts never change, so they're computed once, on first
   use, into a Map; each scroll is now an O(1) lookup. */
let callsPerMinute = null;

function callsInMinute(minute) {
  if (!callsPerMinute) {
    callsPerMinute = new Map();
    for (const event of window.ACTIVITY) {
      const key = event.timestamp.slice(11, 16); // already a UTC ISO string: "HH:MM"
      callsPerMinute.set(key, (callsPerMinute.get(key) || 0) + 1);
    }
  }
  return callsPerMinute.get(minute) || 0;
}
// Build the counts while idle, so the first scroll doesn't pay for 100,000 iterations.
whenIdle(() => callsInMinute(''));

function hidePreview() {
  preview.hidden = true;
}

function showPreview(event) {
  const row = event.target.closest('.result-row');
  if (!row) return;
  const item = window.ACTIVITY.find((candidate) => candidate.id === row.dataset.id);
  if (!item) return;
  preview.textContent = item.summary;
  preview.style.top = event.clientY + 12 + 'px';
  preview.style.left = event.clientX + 12 + 'px';
  preview.hidden = false;
}

const renderedTickerRows = new Map();
let tickerPanel = null;

function tickerRow(event) {
  if (renderedTickerRows.has(event.id)) {
    return renderedTickerRows.get(event.id).cloneNode(true);
  }
  const row = document.createElement('li');
  row.className = 'ticker-row status-' + event.status;
  row.innerHTML =
    '<span class="ticker-time">' + formatTime(event.timestamp) + '</span>' +
    '<span class="ticker-agent">' + escapeHtml(event.agent) + '</span>' +
    '<span class="ticker-tool">' + escapeHtml(event.tool) + '</span>';
  renderedTickerRows.set(event.id, row);
  return row.cloneNode(true);
}

function positionTicker() {
  if (!tickerPanel) return;
  tickerPanel.style.maxHeight = window.innerHeight - 120 + 'px';
}

function openTicker() {
  const panel = document.createElement('aside');
  panel.className = 'ticker';
  panel.innerHTML = '<header class="ticker-header">Live tool calls</header><ul class="ticker-list"></ul>';
  document.body.appendChild(panel);
  tickerPanel = panel;
  const list = panel.querySelector('.ticker-list');

  setInterval(() => {
    const event = window.ACTIVITY[Math.floor(Math.random() * window.ACTIVITY.length)];
    list.prepend(tickerRow(event));
    while (list.children.length > tickerVisibleRows) {
      list.lastElementChild.remove();
    }
  }, tickerIntervalMs);

  window.addEventListener('resize', positionTicker);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeTicker();
  });
  positionTicker();
  tickerToggle.setAttribute('aria-pressed', 'true');
  tickerToggle.textContent = 'Hide live calls';
}

function closeTicker() {
  if (!tickerPanel) return;
  tickerPanel.remove();
  tickerPanel = null;
  tickerToggle.setAttribute('aria-pressed', 'false');
  tickerToggle.textContent = 'Show live calls';
}

// PERF #1: render once the user pauses typing instead of on every keystroke.
let searchTimer = 0;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => renderResults(searchInput.value), 150);
});
window.addEventListener('scroll', onScroll, { passive: true });
// PERF #2: resize fires many times per second while dragging; refit at most once per frame.
let fitFrame = 0;
window.addEventListener('resize', () => {
  if (fitFrame) return;
  fitFrame = requestAnimationFrame(() => {
    fitFrame = 0;
    fitSummaries();
    observeRows(); // the reading band is a share of the viewport height
  });
});
resultsList.addEventListener('mousemove', showPreview);
resultsList.addEventListener('mouseleave', hidePreview);
// PERF #5: wheel/touchstart listeners on an element default to non-passive, so the browser
// had to wait for them before it could scroll. They never call preventDefault.
resultsList.addEventListener('wheel', hidePreview, { passive: true });
resultsList.addEventListener('touchstart', hidePreview, { passive: true });
backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
tickerToggle.addEventListener('click', () => (tickerPanel ? closeTicker() : openTicker()));

renderAgents();
renderResults('');
