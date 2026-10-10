// Reproducible performance measurements for the Perf Clinic page (Part B).
//
// Drives a real Chrome through each user journey the clinic's problems affect and reads
// the browser's own instrumentation (PerformanceObserver entries and Chrome DevTools
// Protocol metrics), so every number in PERF.md can be re-measured with one command:
//
//   npm run perf-clinic                      # serves the page on :5174
//   node tools/perf-bench/bench.mjs --url http://localhost:5174 --label after
//
// Conditions: 4x CPU throttling (a mid-range laptop that is also doing other work), a
// 1366x800 window, a fresh browser profile per run (cold cache), median of 3 runs.
// The load scenario also throttles the network to 10 Mbps / 40 ms RTT.
//
// Options: --url, --label, --runs (3), --cpu (4), --scenarios load,typing,...,
//          --trace (writes Chrome traces you can open in the DevTools Performance panel)

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const args = parseArgs(process.argv.slice(2))
const URL_UNDER_TEST = args.url ?? 'http://localhost:5174'
const LABEL = args.label ?? 'run'
const RUNS = Number(args.runs ?? 3)
const CPU = Number(args.cpu ?? 4)
const TRACE = Boolean(args.trace)
const NETWORK = {
  offline: false,
  latency: 40,
  downloadThroughput: (10 * 1024 * 1024) / 8,
  uploadThroughput: (5 * 1024 * 1024) / 8,
}
const here = dirname(fileURLToPath(import.meta.url))

// Injected before any page script runs. Collects what the page itself reports, and counts
// live intervals (wrapping setInterval/clearInterval only observes, it changes nothing).
const INSTRUMENT = `(() => {
  const perf = (window.__perf = { lcp: 0, cls: 0, longTasks: [], events: [] })
  const observe = (type, onEntry, extra = {}) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({ type, buffered: true, ...extra })
    } catch {}
  }
  observe('largest-contentful-paint', (e) => { perf.lcp = e.startTime })
  observe('layout-shift', (e) => { if (!e.hadRecentInput) perf.cls += e.value })
  observe('longtask', (e) => { window.__perf.longTasks.push([e.startTime, e.duration]) })
  observe('event', (e) => { window.__perf.events.push([e.name, e.startTime, e.duration]) }, { durationThreshold: 16 })
  const live = new Set()
  let ticks = 0
  const setI = window.setInterval.bind(window)
  const clearI = window.clearInterval.bind(window)
  window.setInterval = (cb, ...rest) => {
    const counted = typeof cb === 'function' ? (...a) => { ticks++; return cb(...a) } : cb
    const id = setI(counted, ...rest)
    live.add(id)
    return id
  }
  window.clearInterval = (id) => { live.delete(id); return clearI(id) }
  window.__liveIntervals = () => live.size
  window.__intervalTicks = () => ticks
})()`

const SCENARIOS = { load, typing, returning, scroll, hover, resize, idle, ticker }
const selected = args.scenarios ? args.scenarios.split(',') : Object.keys(SCENARIOS)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const chromeVersion = browser.version()
const raw = {}
console.log(`Measuring ${URL_UNDER_TEST} as "${LABEL}" (Chrome ${chromeVersion}, CPU ${CPU}x, ${RUNS} runs)`)

for (const name of selected) {
  raw[name] = []
  for (let run = 1; run <= RUNS; run++) {
    raw[name].push(await SCENARIOS[name](run))
    process.stdout.write(`  ${name} ${run}/${RUNS}\r`)
  }
  console.log(`  ${name.padEnd(8)} ${JSON.stringify(median(raw[name]))}`)
}
await browser.close()

const results = Object.fromEntries(Object.entries(raw).map(([name, runs]) => [name, median(runs)]))
const outDir = join(here, 'results')
mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, `${LABEL}.json`)
writeFileSync(
  outFile,
  JSON.stringify(
    {
      label: LABEL,
      url: URL_UNDER_TEST,
      measuredAt: new Date().toISOString(),
      chrome: chromeVersion,
      conditions: { cpuThrottling: CPU, loadNetwork: '10 Mbps down, 40 ms RTT', viewport: '1366x800', runs: RUNS },
      results,
      raw,
    },
    null,
    2,
  ) + '\n',
)
console.log(`Wrote ${outFile}`)

// ---------------------------------------------------------------- scenarios

/** Cold load: what the user waits for before seeing and using the page. */
async function load(run) {
  const { context, page } = await open({ network: NETWORK })
  await traced(page, `load-${run}`, async () => {
    await page.goto(URL_UNDER_TEST, { waitUntil: 'load', timeout: 180_000 })
    await page.waitForTimeout(3000) // let LCP, layout shifts and late long tasks settle
  })
  const result = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    const resources = performance.getEntriesByType('resource')
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0
    const tasks = window.__perf.longTasks
    return {
      fcpMs: fcp,
      lcpMs: window.__perf.lcp,
      cls: Number(window.__perf.cls.toFixed(3)),
      loadEventMs: nav.loadEventEnd,
      // Total Blocking Time after first paint: the part of each long task beyond 50 ms.
      tbtMs: tasks.filter(([start]) => start >= fcp).reduce((sum, [, d]) => sum + Math.max(0, d - 50), 0),
      longTaskMs: tasks.reduce((sum, [, d]) => sum + d, 0),
      requests: resources.length + 1,
      transferKB: (resources.reduce((sum, r) => sum + (r.encodedBodySize || 0), 0) + (nav.encodedBodySize || 0)) / 1024,
    }
  })
  await context.close()
  return result
}

/** Typing "billing" into search at a realistic ~400 characters a minute. */
async function typing(run, { seedViewed = 0 } = {}) {
  const { context, page, cdp } = await open()
  if (seedViewed) {
    await page.addInitScript((n) => {
      if (localStorage.getItem('activity:viewed')) return
      const ids = Array.from({ length: n }, (_, i) => `evt_seen_${i}`)
      localStorage.setItem('activity:viewed', JSON.stringify(ids))
    }, seedViewed)
  }
  await ready(page)
  await page.click('#search')
  await page.evaluate(() => {
    window.__perf.events = []
    window.__perf.longTasks = []
    const marks = (window.__marks = { keys: [], updates: [] })
    document.addEventListener('keydown', () => marks.keys.push(performance.now()), true)
    new MutationObserver(() => marks.updates.push(performance.now())).observe(
      document.getElementById('results'),
      { childList: true },
    )
  })
  const before = await metrics(cdp)
  await traced(page, `typing-${run}`, async () => {
    await page.keyboard.type('billing', { delay: 150 })
    await page.waitForTimeout(2000)
  })
  const after = await metrics(cdp)
  const inPage = await page.evaluate(() => {
    const keys = window.__perf.events.filter(([name]) => name.startsWith('key'))
    const { keys: pressed, updates } = window.__marks
    const tasks = window.__perf.longTasks
    return {
      // Event Timing duration: from the key press until the next frame was painted.
      worstKeystrokeMs: Math.max(0, ...keys.map(([, , d]) => d)),
      resultsShownAfterLastKeyMs: updates.length ? updates.at(-1) - pressed.at(-1) : null,
      longTaskMs: tasks.reduce((sum, [, d]) => sum + d, 0),
      blockingMs: tasks.reduce((sum, [, d]) => sum + Math.max(0, d - 50), 0),
      viewedStorageKB: (localStorage.getItem('activity:viewed') ?? '').length / 1024,
    }
  })
  await context.close()
  return { ...inPage, ...work(before, after) }
}

/** The same typing, for a returning user whose "viewed" list already holds 20,000 ids. */
async function returning(run) {
  return typing(run, { seedViewed: 20_000 })
}

/** Wheel-scrolling down the page, the way a person reads it. */
async function scroll(run) {
  const { context, page, cdp } = await open()
  await ready(page)
  await page.mouse.move(683, 420)
  await startFrameLog(page)
  const before = await metrics(cdp)
  await traced(page, `scroll-${run}`, async () => {
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, 100)
      await page.waitForTimeout(16)
    }
    await page.waitForTimeout(500)
  })
  const after = await metrics(cdp)
  const frames = await stopFrameLog(page)
  await context.close()
  const w = work(before, after)
  return { ...frames, ...w, layoutsPerScrollEvent: frames.scrollEvents ? w.layoutCount / frames.scrollEvents : 0 }
}

/** Moving the pointer across the results list (the hover preview follows it). */
async function hover() {
  const { context, page, cdp } = await open()
  await ready(page)
  await page.evaluate(() => document.getElementById('results').scrollIntoView())
  await page.waitForTimeout(500)
  const box = await page.locator('#results').boundingBox()
  await page.evaluate(() => {
    window.__perf.longTasks = []
  })
  const before = await metrics(cdp)
  const moves = 100
  for (let i = 0; i < moves; i++) {
    await page.mouse.move(box.x + 40 + (i % 50) * 12, Math.min(box.y + 60 + i * 5, 780))
  }
  await page.waitForTimeout(300)
  const after = await metrics(cdp)
  const longTaskMs = await page.evaluate(() => window.__perf.longTasks.reduce((s, [, d]) => s + d, 0))
  await context.close()
  const w = work(before, after)
  return { scriptMsPerMove: w.scriptMs / moves, longTaskMs, ...w }
}

/** Resizing the window back and forth (or rotating a tablet). */
async function resize() {
  const { context, page, cdp } = await open()
  await ready(page)
  await page.evaluate(() => {
    window.__perf.longTasks = []
  })
  const before = await metrics(cdp)
  for (let i = 0; i < 10; i++) {
    await page.setViewportSize({ width: i % 2 ? 1366 : 1180, height: 800 })
    await page.waitForTimeout(150)
  }
  const after = await metrics(cdp)
  const longTaskMs = await page.evaluate(() => window.__perf.longTasks.reduce((s, [, d]) => s + d, 0))
  await context.close()
  return { longTaskMs, ...work(before, after) }
}

/** Leaving the page open and untouched: anything happening now is pure overhead. */
async function idle() {
  const { context, page, cdp } = await open()
  await ready(page)
  const before = await metrics(cdp)
  await page.waitForTimeout(3000)
  const after = await metrics(cdp)
  await context.close()
  const w = work(before, after)
  return {
    layoutsPerSecond: w.layoutCount / 3,
    styleRecalcsPerSecond: w.styleRecalcCount / 3,
    mainThreadMsPerSecond: w.taskMs / 3,
  }
}

/** Opening and closing the live ticker 10 times, then leaving it closed. */
async function ticker() {
  const { context, page, cdp } = await open()
  await ready(page)
  const start = await metrics(cdp)
  for (let i = 0; i < 10; i++) {
    await page.click('#ticker-toggle')
    await page.waitForTimeout(250)
    await page.click('#ticker-toggle')
    await page.waitForTimeout(50)
  }
  await page.waitForTimeout(500)
  await cdp.send('HeapProfiler.collectGarbage')
  const closed = await metrics(cdp)
  const ticksAtClose = await page.evaluate(() => window.__intervalTicks())
  await page.waitForTimeout(5000) // the ticker is closed: nothing should be running
  await cdp.send('HeapProfiler.collectGarbage')
  const later = await metrics(cdp)
  const liveIntervals = await page.evaluate(() => window.__liveIntervals())
  const ticksWhileClosed = (await page.evaluate(() => window.__intervalTicks())) - ticksAtClose
  await context.close()
  return {
    liveIntervalsAfterClosing: liveIntervals,
    extraEventListeners: closed.JSEventListeners - start.JSEventListeners,
    // Counted directly, so the page's other idle work (see `idle`) doesn't blur it.
    tickerCallbacksPerSecondWhileClosed: ticksWhileClosed / 5,
    domNodesRetainedPer5sWhileClosed: later.Nodes - closed.Nodes,
    heapGrowthKBPer5sWhileClosed: (later.JSHeapUsedSize - closed.JSHeapUsedSize) / 1024,
  }
}

// ---------------------------------------------------------------- helpers

async function open({ network } = {}) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 } })
  await context.addInitScript(INSTRUMENT)
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
  if (network) {
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', network)
  }
  return { context, page, cdp }
}

/** Loaded, rendered and quiet, so the interaction is measured on its own. */
async function ready(page) {
  await page.goto(URL_UNDER_TEST, { waitUntil: 'load', timeout: 120_000 })
  await page.waitForSelector('#results li', { timeout: 60_000 })
  await page.waitForTimeout(1500)
}

async function metrics(cdp) {
  const { metrics: list } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(list.map(({ name, value }) => [name, value]))
}

/** Main-thread work between two metric snapshots (CDP durations are in seconds). */
function work(a, b) {
  return {
    layoutCount: b.LayoutCount - a.LayoutCount,
    layoutMs: (b.LayoutDuration - a.LayoutDuration) * 1000,
    styleRecalcCount: b.RecalcStyleCount - a.RecalcStyleCount,
    styleMs: (b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000,
    scriptMs: (b.ScriptDuration - a.ScriptDuration) * 1000,
    taskMs: (b.TaskDuration - a.TaskDuration) * 1000,
  }
}

async function startFrameLog(page) {
  await page.evaluate(() => {
    window.__perf.longTasks = []
    const log = (window.__frames = { times: [], scrollEvents: 0, stop: false })
    addEventListener('scroll', () => log.scrollEvents++, { passive: true })
    const tick = (t) => {
      log.times.push(t)
      if (!log.stop) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

async function stopFrameLog(page) {
  return page.evaluate(() => {
    const log = window.__frames
    log.stop = true
    const gaps = log.times.slice(1).map((t, i) => t - log.times[i]).sort((a, b) => a - b)
    const at = (p) => gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))] ?? 0
    const tasks = window.__perf.longTasks
    return {
      frames: log.times.length,
      frameP50Ms: at(0.5),
      frameP95Ms: at(0.95),
      worstFrameMs: gaps.at(-1) ?? 0,
      // Frames that took more than three refresh intervals are visible stutter.
      jankyFrames: gaps.filter((g) => g > 50).length,
      scrollEvents: log.scrollEvents,
      longTaskMs: tasks.reduce((sum, [, d]) => sum + d, 0),
    }
  })
}

async function traced(page, name, fn) {
  if (!TRACE) return fn()
  const dir = join(here, 'traces')
  mkdirSync(dir, { recursive: true })
  await browser.startTracing(page, { path: join(dir, `${LABEL}-${name}.json`), screenshots: true })
  try {
    return await fn()
  } finally {
    await browser.stopTracing()
  }
}

function median(runs) {
  const out = {}
  for (const key of Object.keys(runs[0])) {
    const values = runs.map((r) => r[key]).filter((v) => typeof v === 'number').sort((a, b) => a - b)
    if (!values.length) continue
    const mid = values[Math.floor(values.length / 2)]
    out[key] = Math.abs(mid) >= 100 ? Math.round(mid) : Math.round(mid * 100) / 100
  }
  return out
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    out[key] = next && !next.startsWith('--') ? (i++, next) : true
  }
  return out
}
