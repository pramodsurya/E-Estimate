// Reading the PRED steel/cement index.
//
// The fixture is the real page, saved as fetched. Twelve years of hand-typed
// labels are the whole difficulty here, and a circular attributed to the wrong
// month reprices the wrong period of work — so what is checked is that every
// row is read, and that anything unreadable is reported rather than guessed.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const { parseRateIndex } = require('./rate-scraper/parseIndex.cjs')

const html = fs.readFileSync(
  path.join(root, 'scripts/fixtures/pred-steel-cement-index.html'),
  'utf8'
)
const { documents, unreadable } = parseRateIndex(html)

// --- The real page, read whole --------------------------------------------
assert.equal(unreadable.length, 0, 'every row on the saved page must be readable')
assert.ok(documents.length > 130, `expected the full index, got ${documents.length}`)

// Newest first: the job takes the most recent circulars, so order is not cosmetic.
for (let index = 1; index < documents.length; index += 1) {
  assert.ok(
    documents[index - 1].effectiveFrom >= documents[index].effectiveFrom,
    'circulars must come back newest first'
  )
}

// Every circular must resolve to a real month, and to an absolute URL.
for (const row of documents) {
  assert.match(row.effectiveFrom, /^\d{4}-\d{2}-01$/, `bad date for ${row.label}`)
  assert.ok(row.month >= 1 && row.month <= 12, `bad month for ${row.label}`)
  assert.ok(row.year >= 2014 && row.year <= 2100, `bad year for ${row.label}`)
  assert.ok(
    row.url.startsWith('https://www.pred.telangana.gov.in/'),
    `link not resolved for ${row.label}: ${row.url}`
  )
}

// --- The label shapes the page actually uses ------------------------------
const shapes = [
  ['2_Feb-2014', 2014, 2],
  ['4_April-2014', 2014, 4],
  ['6_June-2014-GoRT', 2014, 6],
  ['8-August-14', 2014, 8],
  ['10_October_2014.PDF', 2014, 10],
  ['2-FEBRUARY-16', 2016, 2],
  ['4-April-16-copy', 2016, 4],
  ['5-May-2026', 2026, 5],
  ['12-December-2025', 2025, 12]
]
for (const [label, year, month] of shapes) {
  const page = `<tr><td>${label}</td><td><a href="/uploads/x.pdf">View</a></td></tr>`
  const [row] = parseRateIndex(page).documents
  assert.ok(row, `"${label}" must be readable`)
  assert.equal(row.year, year, `year of "${label}"`)
  assert.equal(row.month, month, `month of "${label}"`)
}

// --- Both link styles resolve --------------------------------------------
{
  const page =
    '<tr><td>3-March-2023</td><td><a href="assets/pdf/3-STEEL-CEMENT RATES-2014_TO_2023/2023/3-March-2023.pdf">View</a></td></tr>' +
    '<tr><td>4-April-2023</td><td><a href="/uploads/steel-cement-rates/steel-cement-1780727588419-71ab.pdf">View</a></td></tr>'
  const rows = parseRateIndex(page).documents
  assert.equal(rows.length, 2)
  // A relative path with spaces still has to come out as a fetchable URL.
  assert.ok(
    rows.every((row) => row.url.startsWith('https://www.pred.telangana.gov.in/')),
    'both the legacy and the current link style must resolve absolutely'
  )
  assert.ok(
    rows.some((row) => row.url.includes('%20') || row.url.includes('RATES-2014')),
    'the legacy path must survive being made absolute'
  )
}

// --- What cannot be read is reported, never guessed ----------------------
{
  const page =
    '<tr><td>Rates circular</td><td><a href="/uploads/a.pdf">View</a></td></tr>' +
    '<tr><td>13-Undecimber-2025</td><td><a href="/uploads/b.pdf">View</a></td></tr>'
  const result = parseRateIndex(page)
  assert.equal(result.documents.length, 0, 'neither row names a month that exists')
  assert.equal(result.unreadable.length, 2)
  assert.ok(
    result.unreadable.every((row) => typeof row.error === 'string' && row.error.length > 0),
    'each unreadable row must say why'
  )
}

// A label that numbers one month and names another is taken at its name, and
// the disagreement is carried so a reviewer can see it.
{
  const page = '<tr><td>7-August-2025</td><td><a href="/uploads/c.pdf">View</a></td></tr>'
  const [row] = parseRateIndex(page).documents
  assert.equal(row.month, 8, 'the month name wins over the serial number')
  assert.match(row.note ?? '', /numbers it 7 but names month 8/)
}

// The same PDF linked twice is one circular.
{
  const page =
    '<tr><td>5-May-2026</td><td><a href="/uploads/same.pdf">View</a></td></tr>' +
    '<tr><td>5-May-2026</td><td><a href="/uploads/same.pdf">View</a></td></tr>'
  assert.equal(parseRateIndex(page).documents.length, 1)
}

// --- The job must not publish, and must not run on a pull request --------
const sync = fs.readFileSync(path.join(root, 'scripts/rate-scraper/sync.cjs'), 'utf8')
assert.ok(
  !/material_rate_monthly/.test(sync),
  'discovery must never write the table that prices estimates'
)
assert.ok(
  /status: 'downloaded'/.test(sync) && /content_sha256: sha256/.test(sync),
  'a taken circular must be filed with its hash, so a re-run is a no-op'
)

const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/steel-cement-rates.yml'),
  'utf8'
)
assert.ok(
  !/pull_request/.test(workflow),
  'a public repository must not expose the service-role key to fork pull requests'
)
assert.ok(
  /workflow_dispatch/.test(workflow) && /schedule/.test(workflow),
  'the job runs on a schedule and on demand, and nothing else'
)
assert.ok(/concurrency/.test(workflow), 'two runs would race on the unique source_url')

console.log(
  `rate index: all assertions passed — ${documents.length} circulars read from the saved page`
)
