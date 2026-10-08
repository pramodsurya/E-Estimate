const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename
}).outputText, filename)
const canal = require('../src/renderer/src/lib/canal.ts')
const { canalTierReaches, formatCanalReachChainage } = require('../src/renderer/src/lib/canalTierReaches.ts')
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)
const tiers = [
  { id: 'low', minFillHeight: 0, maxFillHeight: 3 },
  { id: 'medium', minFillHeight: 3, maxFillHeight: 6 },
  { id: 'high', minFillHeight: 6, maxFillHeight: 9999 }
]
function fixture(heights, length = 100) {
  const data = canal.defaultCanalData()
  data.lengthM = length
  data.design.bedLevelAtStart = 100
  data.design.bedSlope = 0
  const top = 100 + canal.canalSectionDepth(data.design)
  data.sections = heights.map(([chainage, height]) => ({ chainage, strataTopRl: height == null ? undefined : top - height, ground: [] }))
  return data
}
function check(data, brackets = tiers) {
  const reaches = canalTierReaches(data, data.sections, brackets)
  const stations = new Set([0, data.lengthM, ...data.sections.map(s => s.chainage)])
  near(reaches[0].from, 0)
  near(reaches.at(-1).to, data.lengthM)
  near(reaches.reduce((sum, r) => sum + r.to - r.from, 0), data.lengthM)
  reaches.forEach((r, i) => {
    if (i) near(reaches[i - 1].to, r.from)
    assert.ok(r.to > r.from)
    near(r.intervals.reduce((sum, s) => sum + s.to - s.from, 0), r.to - r.from)
    r.intervals.forEach((s, j) => {
      if (j) near(r.intervals[j - 1].to, s.from)
      assert.ok(s.to > s.from)
      assert.ok(stations.has(s.from) && stations.has(s.to), 'Only entered chainages may delimit intervals')
      if (r.status !== 'missing') {
        near(s.fromBankTopRl - s.fromTopRl, s.fromHeight)
        near(s.toBankTopRl - s.toTopRl, s.toHeight)
      }
    })
  })
  return reaches
}
let data = fixture([[0, 1], [25, 8], [50, -5], [75, 8], [100, 1]])
let reaches = check(data)
assert.deepEqual(reaches.map(r => r.status), ['fill', 'fill', 'cut', 'fill'])
assert.deepEqual(reaches.map(r => r.tierId), ['low', 'high', null, 'high'])
assert.equal(reaches.filter(r => r.tierId === 'high').length, 2)
assert.equal(reaches.filter(r => r.status === 'cut').length, 1)
// Keep all underlying chainages even when their tier forms one reach.
data = fixture([[0, 1], [25, 2], [50, 1], [75, 2], [100, 1]])
reaches = check(data)
assert.equal(reaches.length, 1)
assert.equal(reaches[0].intervals.length, 4)
near(reaches[0].minHeight, 1); near(reaches[0].maxHeight, 2)
// Exact boundaries use the upper tier, while a zero plateau is not a bund.
for (const [h, tierId, status] of [[0, null, 'level'], [3, 'medium', 'fill'], [6, 'high', 'fill'], [-3, null, 'cut'], [12000, 'high', 'fill']]) {
  reaches = check(fixture([[0, h], [100, h]]))
  assert.equal(reaches.length, 1)
  assert.equal(reaches[0].tierId, tierId)
  assert.equal(reaches[0].status, status)
}
// Missing investigation entries interrupt classification; leading/trailing ends are explicit.
reaches = check(fixture([[25, 1], [50, 1], [75, 1]]))
assert.deepEqual(reaches.map(r => r.status), ['missing', 'fill', 'missing'])
reaches = check(fixture([[0, 1], [50, null], [100, 1]]))
assert.equal(reaches.length, 1); assert.equal(reaches[0].status, 'missing')
assert.equal(reaches[0].intervals.length, 2)
assert.equal(check(fixture([]))[0].status, 'missing')
assert.equal(check(fixture([[50, 1]]))[0].status, 'missing')
// Positive fill outside actual brackets must not silently select the highest tier.
reaches = check(fixture([[0, 4], [100, 4]]), [tiers[0], tiers[2]])
assert.equal(reaches[0].status, 'unassigned')
// Unsorted/empty duplicate chainages do not drop an entered Top RL.
data = fixture([[100, 1], [50, null], [0, 1], [50, 2]])
assert.equal(check(data)[0].intervals.length, 2)
data = fixture([[0, 1], [50, 1], [50, 2], [100, 1]])
assert.equal(check(data)[0].status, 'missing')
data = fixture([[0, 1], [100, 1]])
data.design.bedLevelAtStart = NaN
assert.equal(check(data)[0].status, 'missing')
// Regression: the mathematical crossing at 3022.093 is not an entered chainage.
data = fixture([[0, 1], [3000, 1], [3025, -0.131415], [3100, -1]], 3100)
reaches = check(data)
near(reaches[0].to, 3025)
assert.equal(formatCanalReachChainage(reaches[0].to), 'Km 3.025')
assert.equal(formatCanalReachChainage(60964), 'Km 60.964')
assert.equal(formatCanalReachChainage(NaN), '—')
// A falling bank top changes class at the next entered section, without a new station.
data = fixture([[0, 2.1], [10000, 2.1], [60964, 2.1]], 60964)
data.design.bedSlope = 2000
reaches = check(data)
assert.deepEqual(reaches.map(r => r.status), ['fill', 'cut'])
near(reaches[0].to, 10000)
console.log('Canal tier reaches: entered boundaries, repeated tiers, interval retention, full coverage, zero height, missing levels, duplicates and falling bed passed.')

// UI regression: cutting must have its own table with retained interval counts.
require.extensions['.tsx'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: filename
}).outputText, filename)
require.extensions['.css'] = () => {}
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const Summary = require('../src/renderer/src/components/canal/v2/chapters/CanalTierReachSummary.tsx').default
const markup = renderToStaticMarkup(React.createElement(Summary, { data, sections: data.sections, tiers }))
assert.ok(markup.includes('Cutting reaches'))
assert.ok(markup.includes('Km 10.000'))
assert.ok(markup.includes('Km 60.964'))
assert.ok(markup.includes('Show 1 chainage interval'))
assert.ok(markup.includes('60.964 km classified'))
assert.ok(!markup.includes('No positive fill or outside configured tiers'))
console.log('Canal reach summary: separate cutting table, complete coverage and expandable chainage intervals passed.')

// Optionally verify a real saved project without modifying it.
if (process.argv[2]) {
  const project = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  const walk = node => {
    if (node.canal) {
      const d = node.canal
      const result = check(d, d.design.bankConfig.leftTiers)
      const intervals = result.flatMap(r => r.intervals)
      for (const s of d.sections) assert.ok(intervals.some(r => Math.abs(r.from - s.chainage) < 1e-7 || Math.abs(r.to - s.chainage) < 1e-7), `Chainage ${s.chainage} missing`)
      console.log(JSON.stringify({ name: node.name, chainages: d.sections.length, intervals: intervals.length, totalM: result.reduce((sum, r) => sum + r.to - r.from, 0), reaches: result.map(r => ({ status: r.status, tier: r.tierId, from: r.from, to: r.to, intervals: r.intervals.length })) }))
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(project.root)
}
