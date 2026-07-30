// Print tables must fit inside the page margins. Both the on-screen seigniorage
// preview and the generated PDF size their columns in percentages; if a new
// column is added without rebalancing, the totals drift off 100% and the table
// runs past the right margin (as the permit-fee column once did).

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function sum(values) {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(4))
}

// --- On-screen seigniorage print preview (styles.css) -----------------------

const css = fs.readFileSync(path.join(root, 'src/renderer/src/styles/styles.css'), 'utf8')

const SEIG_COLUMNS = ['sl', 'desc', 'qty', 'calc', 'rate', 'seig', 'dmft', 'smft', 'permit']
const widths = SEIG_COLUMNS.map((name) => {
  const rule = new RegExp(`\\.sp-col-${name}, \\.sp-${name} \\{([^}]*)\\}`).exec(css)
  assert.ok(rule, `missing width rule for .sp-${name}`)
  const width = /width:\s*([\d.]+)%/.exec(rule[1])
  assert.ok(width, `.sp-${name} must be sized in % so it scales with the page, got: ${rule[1].trim()}`)
  return Number(width[1])
})
assert.equal(sum(widths), 100, `seigniorage preview columns must total 100%, got ${sum(widths)}`)

// A fixed table layout is what makes those percentages authoritative.
assert.ok(
  /\.seig-print-table \{[^}]*table-layout:\s*fixed/.test(css),
  '.seig-print-table must use table-layout: fixed'
)

// The summary card grid must have a column per card rendered.
const summaryGrid = /\.seig-print-summary \{[^}]*grid-template-columns:\s*repeat\((\d+),/.exec(css)
assert.ok(summaryGrid, 'missing .seig-print-summary grid')
const modal = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/seigniorage/SeignioragePrintPreviewModal.tsx'),
  'utf8'
)
const summaryCards = (
  /<div className="seig-print-summary">([\s\S]*?)<\/div>/.exec(modal)?.[1].match(/<Card\b/g) ?? []
).length
assert.equal(
  Number(summaryGrid[1]),
  summaryCards,
  `summary grid has ${summaryGrid[1]} columns but ${summaryCards} cards are rendered`
)

// --- Generated PDF tables (projectPrint.ts) --------------------------------

const projectPrint = fs.readFileSync(
  path.join(root, 'src/renderer/src/lib/projectPrint.ts'),
  'utf8'
)

const colgroups = projectPrint.match(/<colgroup>[\s\S]*?<\/colgroup>/g) ?? []
assert.ok(colgroups.length >= 3, `expected the abstract, seigniorage and lead colgroups, got ${colgroups.length}`)

for (const [index, group] of colgroups.entries()) {
  const percents = [...group.matchAll(/width:\s*([\d.]+)%/g)].map((match) => Number(match[1]))
  const anyMm = /width:\s*[\d.]+mm/.test(group)
  assert.ok(!anyMm, `colgroup ${index} uses mm widths; use % so it scales with page size and margins`)
  assert.equal(sum(percents), 100, `colgroup ${index} must total 100%, got ${sum(percents)}`)
}

// Page margins come from printToPDF; body padding would double-apply them.
const bodyPadding = [...projectPrint.matchAll(/body\{[^}]*padding:\s*([^;}]+)/g)].map((m) =>
  m[1].trim()
)
for (const padding of bodyPadding) {
  assert.equal(
    padding,
    '0',
    `printed body padding must be 0 (printToPDF already applies the margins), got "${padding}"`
  )
}

console.log('print column layout: all assertions passed')
