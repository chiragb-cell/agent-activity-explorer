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

const minCardHeight = 220;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' });
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
    const image = 'assets/agents/agent-' + String((index % 12) + 1).padStart(2, '0') + '.png';
    return (
      '<article class="agent-card">' +
      '<img class="agent-avatar" src="' + image + '" alt="">' +
      '<h3>' + escapeHtml(agent.name) + '</h3>' +
      '<p class="agent-owner">' + escapeHtml(agent.owner) + '</p>' +
      '<p class="agent-description">' + escapeHtml(agent.description) + '</p>' +
      '<p class="agent-count">' + (counts[agent.name] || 0).toLocaleString() + ' calls today</p>' +
      '</article>'
    );
  }).join('');
  grid.querySelectorAll('img').forEach((img) => img.addEventListener('load', equalizeCardHeights));
}

function equalizeCardHeights() {
  const cards = grid.querySelectorAll('.agent-card');
  cards.forEach((card) => {
    card.style.height = '';
    const rowTop = card.offsetTop;
    let tallest = Math.max(card.offsetHeight, minCardHeight);
    cards.forEach((other) => {
      if (other.offsetTop === rowTop) {
        tallest = Math.max(tallest, other.offsetHeight);
      }
    });
    card.style.height = tallest + 'px';
  });
}

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
let searchTexts = null;

// Values only: JSON.stringify also matched key names, so "tool" or "agent" matched everything.
function searchText(event) {
  return [event.id, event.timestamp, event.agent, event.tool, event.status, event.latencyMs, event.summary]
    .join(' ')
    .toLowerCase();
}

function search(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return newestFirst;
  if (!searchTexts) searchTexts = newestFirst.map(searchText);
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

function onScroll() {
  const scrolled = window.scrollY;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.width = (max > 0 ? (scrolled / max) * 100 : 0) + '%';
  topbar.classList.toggle('topbar-raised', scrolled > 8);
  topbar.style.paddingBlock = Math.max(6, 12 - scrolled / 20) + 'px';
  backToTop.classList.toggle('visible', scrolled > window.innerHeight);
  resultsList.querySelectorAll('.result-row').forEach((row) => {
    row.classList.remove('in-focus');
    const rect = row.getBoundingClientRect();
    if (rect.top > window.innerHeight * 0.3 && rect.top < window.innerHeight * 0.6) {
      row.classList.add('in-focus');
    }
  });
  const focused = resultsList.querySelector('.in-focus');
  if (focused) {
    const minute = focused.dataset.minute;
    const sameMinute = window.ACTIVITY.filter((event) => new Date(event.timestamp).toISOString().slice(11, 16) === minute).length;
    scrollContext.textContent = minute + ' UTC · ' + sameMinute + ' calls that minute';
  } else {
    scrollContext.textContent = '';
  }
}

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
window.addEventListener('scroll', onScroll);
window.addEventListener('resize', equalizeCardHeights);
// PERF #2: resize fires many times per second while dragging; refit at most once per frame.
let fitFrame = 0;
window.addEventListener('resize', () => {
  if (fitFrame) return;
  fitFrame = requestAnimationFrame(() => {
    fitFrame = 0;
    fitSummaries();
  });
});
resultsList.addEventListener('mousemove', showPreview);
resultsList.addEventListener('mouseleave', hidePreview);
resultsList.addEventListener('wheel', hidePreview);
resultsList.addEventListener('touchstart', hidePreview);
backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
tickerToggle.addEventListener('click', () => (tickerPanel ? closeTicker() : openTicker()));

renderAgents();
equalizeCardHeights();
renderResults('');
