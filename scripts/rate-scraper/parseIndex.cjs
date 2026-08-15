'use strict'

/**
 * Read the PRED steel/cement index into a list of monthly circulars.
 *
 * The page is an index, not a rate table: `S.No | Year | Documents`, one row per
 * month, each linking to a PDF. Two things about it shape this parser.
 *
 * The newer links carry a timestamp and a UUID —
 * `/uploads/steel-cement-rates/steel-cement-1780727588419-71ab3de4-….pdf` — so
 * a URL cannot be constructed for a month you want. The index is the only way
 * to discover one, which is why this exists at all.
 *
 * And the labels are twelve years of hand-typing. Real examples from the page:
 *
 *     2_Feb-2014      4_April-2014        6_June-2014-GoRT
 *     8-August-14     10_October_2014.PDF 2-FEBRUARY-16
 *     4-April-16-copy 5-May-2026
 *
 * Separators vary, months are abbreviated or not, years are two or four digits,
 * and some carry a trailing note. So the label is read for meaning rather than
 * matched against a shape: a leading month number, a month name found anywhere
 * in it, and a year. Anything that cannot be read is *reported*, never guessed —
 * a circular silently attributed to the wrong month would reprice the wrong
 * period of work.
 */

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december'
]

/** `Sept` and `Sep` both appear; match on the longest unambiguous prefix. */
function monthFromName(text) {
  const cleaned = text.toLowerCase()
  for (let index = 0; index < MONTHS.length; index += 1) {
    const name = MONTHS[index]
    // Three letters identify every month except June/July, which differ at
    // the third character anyway, so a 3-character prefix is safe throughout.
    const pattern = new RegExp(`\\b${name.slice(0, 3)}[a-z]*\\b`)
    if (pattern.test(cleaned)) return index + 1
  }
  return null
}

/**
 * Two-digit years appear from 2014 onward and there is no circular before
 * then, so the century is never in doubt.
 */
function normaliseYear(raw) {
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  if (raw.length === 4) return value
  if (raw.length === 2) return 2000 + value
  return null
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/**
 * Resolve a link exactly as a browser would, so the two styles on the page —
 * `/uploads/…` and `assets/pdf/…` — both come out absolute. Paths contain
 * spaces, which `URL` encodes for us.
 */
function absoluteUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return null
  }
}

/**
 * One circular, or a reason it could not be read.
 *
 * `effectiveFrom` is the first of the month: a circular published for March
 * governs March, and the app's `periodForDate` looks it up by date.
 */
function readRow(label, href, baseUrl) {
  const text = decodeEntities(label).trim().replace(/\.pdf$/i, '')
  const url = absoluteUrl(decodeEntities(href).trim(), baseUrl)
  if (!url) return { label: text, error: 'the link could not be resolved' }

  const yearMatch = text.match(/(?:^|[^0-9])((?:19|20)\d{2})(?![0-9])/)
  const shortYear = yearMatch ? null : text.match(/-(\d{2})(?:\b|[^0-9])/)
  const year = normaliseYear(yearMatch ? yearMatch[1] : shortYear ? shortYear[1] : '')
  const named = monthFromName(text)
  const leading = text.match(/^\s*(\d{1,2})\s*[-_]/)
  const numbered = leading ? Number(leading[1]) : null

  if (!year) return { label: text, url, error: 'no year in the label' }
  if (!named && !numbered) return { label: text, url, error: 'no month in the label' }

  // The name wins: the leading number is a serial that usually matches the
  // month but is not required to. Disagreement is worth saying out loud.
  const month = named ?? numbered
  const disagreement =
    named && numbered && named !== numbered
      ? `label numbers it ${numbered} but names month ${named}`
      : null
  if (month < 1 || month > 12) return { label: text, url, error: `month ${month} is not a month` }

  return {
    label: text,
    url,
    year,
    month,
    effectiveFrom: `${year}-${String(month).padStart(2, '0')}-01`,
    note: disagreement
  }
}

/**
 * Every circular the index offers, newest first, with anything unreadable
 * separated out rather than dropped.
 */
function parseRateIndex(html, baseUrl = 'https://www.pred.telangana.gov.in/steel_cement_rates.php') {
  const rows = [...html.matchAll(/<tr>\s*<td>([^<]*)<\/td>\s*<td>\s*<a\s+href="([^"]+)"/gi)]
  const documents = []
  const unreadable = []
  const seen = new Set()

  for (const [, label, href] of rows) {
    const row = readRow(label, href, baseUrl)
    if (row.error) {
      unreadable.push(row)
      continue
    }
    // The same PDF is occasionally linked twice; the first wins.
    if (seen.has(row.url)) continue
    seen.add(row.url)
    documents.push(row)
  }

  documents.sort((left, right) =>
    left.effectiveFrom === right.effectiveFrom
      ? 0
      : left.effectiveFrom < right.effectiveFrom
        ? 1
        : -1
  )
  return { documents, unreadable }
}

module.exports = { parseRateIndex, monthFromName, normaliseYear }
