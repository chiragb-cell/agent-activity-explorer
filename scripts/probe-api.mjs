// Probes the mock API and prints latency/failure statistics plus response *shapes*.
//
// Why: the brief says to treat the API as a third-party service, so timeouts, retry
// rules and empty/error states should be designed from measured behaviour, not guesses.
//
// Why shapes only: event payloads deliberately contain hostile strings (shell commands,
// fake tokens, prompt-injection text). Types, sizes and counts are enough to design
// against, and they keep that text out of logs, docs and AI prompts.
//
// Usage: node scripts/probe-api.mjs [--base http://localhost:4000] [--n 40] [--json out.json]

import { writeFileSync } from "node:fs";

const options = parseArgs(process.argv.slice(2));
const BASE = options.base ?? "http://localhost:4000";
const N = Number(options.n ?? 40);
const ORIGIN = "http://localhost:5173"; // Vite's default dev origin, to check CORS.
const REQUEST_TIMEOUT_MS = 40_000; // Generous on purpose: we want to *see* slow tails.

const report = {};

// ---------- helpers ----------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, "")] = argv[i + 1];
  return out;
}

async function timed(path) {
  const started = performance.now();
  try {
    const res = await fetch(BASE + path, {
      headers: { Origin: ORIGIN },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return {
      ok: res.ok,
      status: res.status,
      ms: performance.now() - started,
      headers: Object.fromEntries(res.headers),
      json,
      bytes: text.length,
      unparseable: json === undefined && text.length > 0,
    };
  } catch (err) {
    return {
      ok: false,
      status: err.name === "TimeoutError" ? "timeout" : "network",
      ms: performance.now() - started,
    };
  }
}

/** Describes a JSON value by type only — never prints the value itself. */
function shape(value, depth = 0) {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (depth > 2) return `array(${value.length})`;
    return `array(${value.length})<${value.length ? shape(value[0], depth + 1) : "?"}>`;
  }
  if (typeof value === "object") {
    if (depth > 2) return "object";
    const fields = Object.entries(value).map(([k, v]) => `${k}: ${shape(v, depth + 1)}`);
    return `{ ${fields.join(", ")} }`;
  }
  return typeof value;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, index)]);
}

function summarize(results) {
  const all = results.map((r) => r.ms).sort((a, b) => a - b);
  const okMs = results.filter((r) => r.ok).map((r) => r.ms).sort((a, b) => a - b);
  const failMs = results.filter((r) => !r.ok).map((r) => r.ms).sort((a, b) => a - b);
  const statuses = {};
  for (const r of results) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
  return {
    n: results.length,
    statuses,
    failureRate: `${((100 * failMs.length) / results.length).toFixed(1)}%`,
    latencyAll: { p50: percentile(all, 50), p90: percentile(all, 90), p95: percentile(all, 95), p99: percentile(all, 99), max: percentile(all, 100) },
    latencyOk: { p50: percentile(okMs, 50), p95: percentile(okMs, 95), max: percentile(okMs, 100) },
    latencyFailed: failMs.length ? { p50: percentile(failMs, 50), max: percentile(failMs, 100) } : null,
    unparseableBodies: results.filter((r) => r.unparseable).length,
  };
}

/** Error bodies come from the API itself (not event payloads), so short messages are safe to show. */
function errorBodies(results) {
  const seen = new Map();
  for (const r of results.filter((x) => !x.ok && typeof x.status === "number")) {
    const key = `${r.status} ${r.headers?.["content-type"] ?? "?"} ${r.json ? shape(r.json) : `text(${r.bytes})`}`;
    const message = r.json && typeof r.json.error === "string" && r.json.error.length < 120 ? r.json.error : undefined;
    seen.set(key, message ?? seen.get(key));
  }
  return [...seen].map(([k, msg]) => (msg ? `${k} -> "${msg}"` : k));
}

async function battery(paths, concurrency = 4) {
  const results = new Array(paths.length);
  let next = 0;
  async function worker() {
    while (next < paths.length) {
      const i = next++;
      results[i] = await timed(paths[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

/** Describes the cursor's *structure*. The brief calls it opaque, so the app never parses it. */
function describeCursor(cursor) {
  const decoded = Buffer.from(cursor, "base64").toString("utf8");
  try {
    return `base64 JSON ${shape(JSON.parse(decoded))}`;
  } catch {
    if (/^\d{13}\|evt_[0-9A-Z]+$/.test(decoded)) return "base64('<unixMillis>|<eventId>') — a keyset cursor";
    return "opaque";
  }
}

/** Keeps an SSE connection open for `ms`; returns how many events arrived. */
async function listenToStream(ms) {
  let events = 0;
  try {
    const res = await fetch(BASE + "/stream", { signal: AbortSignal.timeout(ms) });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      events += (decoder.decode(value).match(/^data:/gm) ?? []).length;
    }
  } catch {
    // The timeout ends the read loop; that's expected.
  }
  return events;
}

function maxDepth(value, depth = 0) {
  if (value === null || typeof value !== "object") return depth;
  const children = Object.values(value);
  return children.length ? Math.max(...children.map((v) => maxDepth(v, depth + 1))) : depth + 1;
}

function longestString(value) {
  if (typeof value === "string") return value.length;
  if (value === null || typeof value !== "object") return 0;
  return Math.max(0, ...Object.values(value).map(longestString));
}

async function firstOk(path, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    const r = await timed(path);
    if (r.ok && r.json) return r;
  }
  return null;
}

function log(title, value) {
  report[title] = value;
  console.log(`\n## ${title}`);
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

// ---------- probes ----------

console.log(`Probing ${BASE} with n=${N} …`);

const totalAtStart = await firstOk("/events?limit=1");
log("events: first response shape", totalAtStart ? shape(totalAtStart.json) : "no successful response");
log("headers on /events (CORS etc.)", totalAtStart
  ? Object.fromEntries(Object.entries(totalAtStart.headers).filter(([k]) => /access-control|content-type|cache|retry|request-id|x-/i.test(k)))
  : null);

const agents = await battery(Array.from({ length: N }, () => "/agents"));
const okAgents = agents.find((r) => r.ok && r.json);
log("/agents", { ...summarize(agents), shape: okAgents ? shape(okAgents.json) : null, errors: errorBodies(agents) });
const agentNames = Array.isArray(okAgents?.json) ? okAgents.json : (okAgents?.json?.agents ?? []);
log("agent names (identifiers only)", agentNames);

for (const limit of [50, 100, 200]) {
  const results = await battery(Array.from({ length: N }, () => `/events?limit=${limit}`));
  const sample = results.find((r) => r.ok && r.json);
  log(`/events?limit=${limit}`, {
    ...summarize(results),
    itemsReturned: sample?.json?.items?.length ?? null,
    bytesPerPage: sample?.bytes ?? null,
    errors: errorBodies(results),
  });
}

// Pagination: follow cursors, check ordering, duplicates and the cursor format.
{
  const pages = [];
  let cursor;
  for (let page = 0; page < 6; page++) {
    const r = await firstOk(`/events?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    if (!r) break;
    pages.push(r.json);
    cursor = r.json.nextCursor;
    if (!cursor) break;
  }
  const ids = pages.flatMap((p) => (p.items ?? []).map((e) => e.id));
  const stamps = pages.flatMap((p) => (p.items ?? []).map((e) => e.timestamp));
  const descending = stamps.every((t, i) => i === 0 || stamps[i - 1] >= t);
  const statusMix = {};
  for (const p of pages) for (const e of p.items ?? []) statusMix[e.status] = (statusMix[e.status] ?? 0) + 1;
  const toolSet = new Set(pages.flatMap((p) => (p.items ?? []).map((e) => e.tool)));
  const latencies = pages.flatMap((p) => (p.items ?? []).map((e) => e.latencyMs)).sort((a, b) => a - b);
  const argsPreviewLengths = pages.flatMap((p) => (p.items ?? []).map((e) => (e.argsPreview ?? "").length)).sort((a, b) => a - b);
  log("pagination", {
    pagesFetched: pages.length,
    items: ids.length,
    duplicateIds: ids.length - new Set(ids).size,
    sortedNewestFirst: descending,
    newest: stamps[0] ?? null,
    oldestSeen: stamps.at(-1) ?? null,
    cursor: pages[0]?.nextCursor ? describeCursor(pages[0].nextCursor) : null,
    totals: pages.map((p) => p.total),
    statusMix,
    tools: [...toolSet].sort(),
    eventLatencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), max: percentile(latencies, 100) },
    argsPreviewLength: { p50: percentile(argsPreviewLengths, 50), max: percentile(argsPreviewLengths, 100) },
  });
}

// Are pages stable while new events arrive? New events only appear while someone is
// subscribed to /stream, so keep a subscriber open between fetching page 1 and page 2.
{
  const first = await firstOk("/events?limit=100");
  const arrived = await listenToStream(10_000);
  const second = first?.json?.nextCursor
    ? await firstOk(`/events?limit=100&cursor=${encodeURIComponent(first.json.nextCursor)}`)
    : null;
  const firstIds = new Set(first?.json?.items?.map((e) => e.id) ?? []);
  log("cursor stability under inserts", {
    newEventsWhileWaiting: arrived,
    totalBefore: first?.json?.total ?? null,
    totalAfter: second?.json?.total ?? null,
    overlapBetweenPages: second ? second.json.items.filter((e) => firstIds.has(e.id)).length : null,
    page2ContinuesWherePage1Ended: second ? second.json.items[0].timestamp <= first.json.items.at(-1).timestamp : null,
  });
}

// Empty results: does the Go API send `items: null` and an empty-string cursor?
{
  const r = await firstOk("/events?q=zzzz_no_such_event_zzzz");
  log("no-match query", r
    ? { shape: shape(r.json), itemsIsNull: r.json.items === null, nextCursor: JSON.stringify(r.json.nextCursor), total: r.json.total }
    : "no successful response");
}

// Filters behave as documented?
{
  const two = agentNames.slice(0, 2);
  const agentQuery = two.map((a) => `agent=${encodeURIComponent(a)}`).join("&");
  const byAgent = await firstOk(`/events?limit=200&${agentQuery}`);
  const byStatus = await firstOk("/events?limit=200&status=error");
  const byQ = await firstOk("/events?limit=200&q=sql");
  log("filters", {
    agentFilterRespected: byAgent?.json?.items?.every((e) => two.includes(e.agent)) ?? null,
    agentFilterTotal: byAgent?.json?.total ?? null,
    statusFilterRespected: byStatus?.json?.items?.every((e) => e.status === "error") ?? null,
    statusErrorTotal: byStatus?.json?.total ?? null,
    qSqlTotal: byQ?.json?.total ?? null,
    qMatchesToolOrAgent: byQ?.json?.items?.length
      ? byQ.json.items.filter((e) => /sql/i.test(e.tool) || /sql/i.test(e.agent)).length + ` of ${byQ.json.items.length}`
      : null,
  });
}

// Invalid input handling.
{
  const cases = ["/events?status=bogus", "/events?limit=1000", "/events?limit=0", "/events?cursor=garbage", "/events?from=not-a-date", "/events/histogram?bucket=7m"];
  const out = {};
  for (const path of cases) {
    const r = await timed(path);
    out[path] = `${r.status} ${r.json ? shape(r.json) : `text(${r.bytes ?? 0})`}${r.json?.error ? ` -> "${String(r.json.error).slice(0, 120)}"` : ""}${r.json?.items ? ` items=${r.json.items.length}` : ""}`;
  }
  log("invalid input", out);
}

// Detail endpoint: shapes and payload sizes, plus a guaranteed 404.
// The brief warns `args` "can be large", so sample widely to find the real upper bound.
{
  const wanted = Number(options.details ?? 1000);
  const ids = [];
  let cursor;
  while (ids.length < wanted) {
    const page = await firstOk(`/events?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    if (!page) break;
    ids.push(...page.json.items.map((e) => e.id));
    cursor = page.json.nextCursor;
    if (!cursor) break;
  }
  const results = await battery(ids.slice(0, wanted).map((id) => `/events/${encodeURIComponent(id)}`), 8);
  const ok = results.filter((r) => r.ok && r.json);
  const argTypes = {};
  const resultTypes = {};
  const policyTypes = {};
  for (const r of ok) {
    const a = r.json.args === null ? "null" : Array.isArray(r.json.args) ? "array" : typeof r.json.args;
    const res = r.json.result === null ? "null" : Array.isArray(r.json.result) ? "array" : typeof r.json.result;
    const p = r.json.policyMatches === null ? "null" : Array.isArray(r.json.policyMatches) ? `array(${r.json.policyMatches.length ? "non-empty" : "empty"})` : typeof r.json.policyMatches;
    argTypes[a] = (argTypes[a] ?? 0) + 1;
    resultTypes[res] = (resultTypes[res] ?? 0) + 1;
    policyTypes[p] = (policyTypes[p] ?? 0) + 1;
  }
  const sizes = ok.map((r) => r.bytes).sort((a, b) => a - b);
  const depths = ok.map((r) => Math.max(maxDepth(r.json.args), maxDepth(r.json.result))).sort((a, b) => a - b);
  const strings = ok.map((r) => Math.max(longestString(r.json.args), longestString(r.json.result))).sort((a, b) => a - b);
  const policyNames = new Set(ok.flatMap((r) => r.json.policyMatches ?? []));
  log("/events/:id", {
    ...summarize(results),
    keys: ok[0] ? Object.keys(ok[0].json) : null,
    argsTypes: argTypes,
    resultTypes,
    policyMatchesTypes: policyTypes,
    policyNames: [...policyNames].sort(), // rule identifiers, not payload text
    bodyBytes: { p50: percentile(sizes, 50), p95: percentile(sizes, 95), p99: percentile(sizes, 99), max: percentile(sizes, 100) },
    nestingDepth: { p50: percentile(depths, 50), max: percentile(depths, 100) },
    longestStringValue: { p50: percentile(strings, 50), max: percentile(strings, 100) },
    errors: errorBodies(results),
  });
  const missing = await timed("/events/evt_does_not_exist_000");
  log("/events/:id unknown id", `${missing.status} ${missing.headers?.["content-type"] ?? ""} ${missing.json ? shape(missing.json) : `text(${missing.bytes ?? 0})`}${missing.json?.error ? ` -> "${missing.json.error}"` : ""}`);
}

// Histogram: shape, coverage and gaps (empty buckets are omitted per the brief).
for (const bucket of ["1m", "5m", "1h"]) {
  const results = await battery(Array.from({ length: Math.ceil(N / 2) }, () => `/events/histogram?bucket=${bucket}`));
  const ok = results.find((r) => r.ok && r.json);
  const buckets = ok?.json?.buckets ?? [];
  const step = { "1m": 60e3, "5m": 300e3, "1h": 3600e3 }[bucket];
  let gaps = 0;
  for (let i = 1; i < buckets.length; i++) if (Date.parse(buckets[i].t) - Date.parse(buckets[i - 1].t) !== step) gaps++;
  log(`/events/histogram?bucket=${bucket}`, {
    ...summarize(results),
    shape: ok ? shape(ok.json) : null,
    buckets: buckets.length,
    first: buckets[0]?.t ?? null,
    last: buckets.at(-1)?.t ?? null,
    gapsBetweenBuckets: gaps,
    sumOfCounts: buckets.reduce((s, b) => s + b.count, 0),
    errors: errorBodies(results),
  });
}

// SSE stream: cadence, `id:` lines and payload shape over ~12 seconds.
{
  const started = performance.now();
  const stats = { events: 0, withId: 0, retryLines: [], eventTypes: {}, dataShape: null, firstAfterMs: null, status: null, contentType: null };
  try {
    const res = await fetch(BASE + "/stream", { headers: { Origin: ORIGIN, Accept: "text/event-stream" }, signal: AbortSignal.timeout(12_000) });
    stats.status = res.status;
    stats.contentType = res.headers.get("content-type");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const lines = block.split("\n");
        const data = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
        const type = lines.find((l) => l.startsWith("event:"))?.slice(6).trim() ?? "message";
        for (const l of lines) if (l.startsWith("retry:")) stats.retryLines.push(l.slice(6).trim());
        if (!data) continue;
        stats.events++;
        stats.eventTypes[type] = (stats.eventTypes[type] ?? 0) + 1;
        if (lines.some((l) => l.startsWith("id:"))) stats.withId++;
        if (stats.firstAfterMs === null) stats.firstAfterMs = Math.round(performance.now() - started);
        if (!stats.dataShape) {
          try {
            stats.dataShape = shape(JSON.parse(data));
          } catch {
            stats.dataShape = "non-JSON data";
          }
        }
      }
    }
  } catch (err) {
    stats.endedBy = err.name;
  }
  log("/stream (12s sample)", stats);
}

// Does the dataset grow while the API runs? (It matters for offset-based cursors.)
{
  const r = await firstOk("/events?limit=1");
  log("total drift", { atStart: totalAtStart?.json?.total ?? null, atEnd: r?.json?.total ?? null });
}

if (options.json) {
  writeFileSync(options.json, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${options.json}`);
}
