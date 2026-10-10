// Prints a Markdown before/after table from two bench result files:
//
//   node tools/perf-bench/compare.mjs tools/perf-bench/results/before.json tools/perf-bench/results/after.json

import { readFileSync } from 'node:fs'

const [beforeFile, afterFile] = process.argv.slice(2)
if (!beforeFile || !afterFile) {
  console.error('Usage: node compare.mjs <before.json> <after.json>')
  process.exit(1)
}
const before = JSON.parse(readFileSync(beforeFile, 'utf8'))
const after = JSON.parse(readFileSync(afterFile, 'utf8'))

console.log(`| Scenario | Metric | ${before.label} | ${after.label} | Change |`)
console.log('|---|---|---:|---:|---:|')
for (const [scenario, metrics] of Object.entries(before.results)) {
  for (const [metric, was] of Object.entries(metrics)) {
    const now = after.results[scenario]?.[metric]
    if (now === undefined) continue
    console.log(`| ${scenario} | ${metric} | ${fmt(was)} | ${fmt(now)} | ${change(was, now)} |`)
  }
}

function fmt(value) {
  return Number.isInteger(value) ? value.toLocaleString('en-US') : String(value)
}

function change(was, now) {
  if (was === now) return '='
  if (was === 0) return `+${fmt(now)}`
  if (now === 0) return '−100%'
  const ratio = was / now
  return ratio >= 2 ? `${ratio.toFixed(ratio >= 10 ? 0 : 1)}× less` : `${(((now - was) / was) * 100).toFixed(0)}%`
}
