const assert = require('node:assert/strict')
const path = require('node:path')

// Test logic matching src/renderer/src/lib/placeNormalization.ts
const KNOWN_UPPERCASE = new Set([
  'GHMC',
  'HMDA',
  'TSIIC',
  'ORR',
  'HQ',
  'ITDA'
])

const ROMAN_NUMERAL_REGEX = /\b(i{1,3}|iv|vi{0,3}|ix|x)\b/gi

function normalizePlaceName(value) {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (KNOWN_UPPERCASE.has(trimmed.toUpperCase())) {
    return trimmed.toUpperCase()
  }

  return trimmed
    .toLowerCase()
    .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, boundary, letter) => boundary + letter.toUpperCase())
    .replace(ROMAN_NUMERAL_REGEX, (match) => match.toUpperCase())
    .replace(/\b([a-z]{2,5})\b/gi, (word) => {
      if (KNOWN_UPPERCASE.has(word.toUpperCase())) {
        return word.toUpperCase()
      }
      return word
    })
}

function normalizeSavedCoverTypst(source) {
  return source.replace(
    /(\[#text\([^)]*?\)\s*\[(?:VILLAGE|MANDAL|DISTRICT)\]\],\s*\[)([^\]\r\n]+)(\])/g,
    (_, prefix, val, suffix) => `${prefix}${normalizePlaceName(val)}${suffix}`
  )
}

// 1. Basic title casing
assert.equal(normalizePlaceName('WARANGAL'), 'Warangal')
assert.equal(normalizePlaceName('warangal'), 'Warangal')
assert.equal(normalizePlaceName('dharur'), 'Dharur')
assert.equal(normalizePlaceName('DHARUR'), 'Dharur')
assert.equal(normalizePlaceName('Mallampet'), 'Mallampet')
assert.equal(normalizePlaceName('MALLAMPET'), 'Mallampet')

// 2. Hyphenated and compound names
assert.equal(normalizePlaceName('MEDCHAL-MALKAJGIRI'), 'Medchal-Malkajgiri')
assert.equal(normalizePlaceName('medchal-malkajgiri'), 'Medchal-Malkajgiri')
assert.equal(normalizePlaceName('RANGA REDDY'), 'Ranga Reddy')
assert.equal(normalizePlaceName('ranga reddy'), 'Ranga Reddy')
assert.equal(normalizePlaceName('KUMURAM BHEEM ASIFABAD'), 'Kumuram Bheem Asifabad')
assert.equal(normalizePlaceName('JAYASHANKAR BHUPALPALLY'), 'Jayashankar Bhupalpally')
assert.equal(normalizePlaceName('BHADRADRI KOTHAGUDEM'), 'Bhadradri Kothagudem')

// 3. Parenthesized descriptors
assert.equal(normalizePlaceName('WARANGAL (URBAN)'), 'Warangal (Urban)')
assert.equal(normalizePlaceName('warangal (urban)'), 'Warangal (Urban)')
assert.equal(normalizePlaceName('WARANGAL (R)'), 'Warangal (R)')
assert.equal(normalizePlaceName('khammam (r)'), 'Khammam (R)')

// 4. Roman numerals
assert.equal(normalizePlaceName('SECTOR-II'), 'Sector-II')
assert.equal(normalizePlaceName('PHASE-IV'), 'Phase-IV')
assert.equal(normalizePlaceName('WARD-III'), 'Ward-III')

// 5. Known acronyms
assert.equal(normalizePlaceName('GHMC'), 'GHMC')
assert.equal(normalizePlaceName('ghmc'), 'GHMC')
assert.equal(normalizePlaceName('HMDA'), 'HMDA')

// 6. Null and empty handling
assert.equal(normalizePlaceName(null), '')
assert.equal(normalizePlaceName(undefined), '')
assert.equal(normalizePlaceName('   '), '')

// 7. Typst source normalization
const sampleTypst = `
  [#text(size: 8pt, tracking: 0.7pt, weight: "bold", fill: muted)[VILLAGE]], [MALLAMPET],
  [#text(size: 8pt, tracking: 0.7pt, weight: "bold", fill: muted)[MANDAL]], [dharur],
  [#text(size: 8pt, tracking: 0.7pt, weight: "bold", fill: muted)[DISTRICT]], [VIKARABAD],
  [#text(size: 8pt, tracking: 0.7pt, weight: "bold", fill: muted)[SSR YEAR]], [2025-26],
`

const normalizedTypst = normalizeSavedCoverTypst(sampleTypst)
assert.ok(normalizedTypst.includes('[Mallampet]'))
assert.ok(normalizedTypst.includes('[Dharur]'))
assert.ok(normalizedTypst.includes('[Vikarabad]'))
assert.ok(normalizedTypst.includes('[2025-26]'))

console.log('Place normalization tests passed successfully!')
