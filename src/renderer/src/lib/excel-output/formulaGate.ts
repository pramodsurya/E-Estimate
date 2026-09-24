/**
 * Formula teacher for Univer → Excel export.
 *
 * A Univer cell carries `f` (formula text) and `v` (computed value). This
 * gate decides per formula whether the text is safe to write as a live Excel
 * formula. Pass → `{ ok: true, excel }` with same-sheet references rebased to
 * the exported grid. Fail → `{ ok: false, reason }` and the caller writes the
 * computed value instead. The value fallback is always correct; a live
 * formula is only written when proven safe.
 *
 * Reject rules (strict by design):
 * - unknown / modern-only functions (anything outside SAFE_FUNCTIONS:
 *   LAMBDA, XLOOKUP, TEXTSPLIT, FILTER, ...),
 * - position-sensitive functions whose answer moves with the grid
 *   (ROW, COLUMN, CELL, INFO) and INDIRECT, which builds references from
 *   text and would bypass rebasing,
 * - cross-sheet references (other sheets are not part of this export),
 *   external links (`[...]`), structured table references,
 * - references outside the exported range (they would point at wrong cells
 *   after rebasing),
 * - error literals (`#REF!`), spill (`#`) and implicit-intersection (`@`)
 *   operators, array constants, locale `;` separators, anything unparseable.
 *
 * String literals (`"..."`) are located up front and every later scan skips
 * their spans, so text like `"Sheet1!A1"` never scans as a reference.
 */

export interface FormulaGateScope {
  /** 0-based Univer sheet coordinates of the exported range. */
  startRow: number
  startColumn: number
  endRow: number
  endColumn: number
  /** Name of the sheet the formula lives on; any other qualifier fails. */
  sheetName?: string
}

export type FormulaGateVerdict = { ok: true; excel: string } | { ok: false; reason: string }

export interface FormulaCellVerdict {
  /** Original sheet address, e.g. `C7`. */
  addr: string
  ok: boolean
  reason?: string
}

/**
 * Excel-safe functions: stable across engines since Excel 2010 or earlier,
 * deterministic for given inputs, no dynamic arrays, no web/stock add-ins.
 */
const SAFE_FUNCTIONS = new Set([
  'SUM', 'AVERAGE', 'COUNT', 'COUNTA', 'COUNTBLANK', 'MIN', 'MAX',
  'ABS', 'INT', 'TRUNC', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'MOD', 'POWER',
  'SQRT', 'SUMSQ', 'PRODUCT', 'SUMPRODUCT', 'EXP', 'LN', 'LOG', 'LOG10',
  'PI', 'SIGN', 'MEDIAN', 'LARGE', 'SMALL', 'RANK', 'EVEN', 'ODD',
  'MROUND', 'FLOOR', 'CEILING', 'GCD', 'LCM', 'STDEV', 'STDEVP', 'VAR', 'VARP',
  'IF', 'AND', 'OR', 'NOT', 'XOR', 'IFERROR', 'ISBLANK', 'ISNUMBER',
  'ISTEXT', 'ISERROR', 'ISNA', 'ISEVEN', 'ISODD', 'N', 'T', 'TRUE', 'FALSE',
  'CONCATENATE', 'LEFT', 'RIGHT', 'MID', 'LEN', 'TRIM', 'UPPER', 'LOWER',
  'PROPER', 'TEXT', 'VALUE', 'SUBSTITUTE', 'REPLACE', 'FIND', 'SEARCH',
  'EXACT', 'REPT',
  'VLOOKUP', 'HLOOKUP', 'LOOKUP', 'INDEX', 'MATCH', 'CHOOSE', 'OFFSET',
  'ROWS', 'COLUMNS',
  'TODAY', 'NOW', 'DATE', 'TIME', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE',
  'SECOND', 'WEEKDAY', 'DAYS', 'DATEDIF', 'EDATE', 'EOMONTH', 'NETWORKDAYS',
  'WORKDAY',
  'SUMIF', 'SUMIFS', 'COUNTIF', 'COUNTIFS', 'AVERAGEIF', 'AVERAGEIFS',
  'SUBTOTAL', 'AGGREGATE',
  'PMT', 'FV', 'PV', 'NPV', 'IRR', 'RATE', 'NPER',
  'RAND', 'RANDBETWEEN'
])

const MAX_FORMULA_LEN = 8000

function fail(reason: string): FormulaGateVerdict {
  return { ok: false, reason }
}

function colLettersToIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function colIndexToLetters(index: number): string {
  let n = index
  let label = ''
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

function unquoteSheetName(quoted: string): string {
  if (quoted.length >= 2 && quoted.startsWith("'") && quoted.endsWith("'")) {
    return quoted.slice(1, -1).replace(/''/g, "'")
  }
  return quoted
}

interface LitSpan {
  start: number
  end: number
}

/** Locate `"..."` literal spans; `""` inside is an escaped quote. */
function literalSpans(body: string): { spans: LitSpan[]; unterminated: boolean } {
  const spans: LitSpan[] = []
  let i = 0
  while (i < body.length) {
    if (body[i] !== '"') {
      i += 1
      continue
    }
    const start = i
    i += 1
    let closed = false
    while (i < body.length) {
      if (body[i] === '"') {
        if (body[i + 1] === '"') i += 2
        else {
          closed = true
          i += 1
          break
        }
      } else i += 1
    }
    if (!closed) return { spans, unterminated: true }
    spans.push({ start, end: i })
  }
  return { spans, unterminated: false }
}

function inSpans(spans: LitSpan[], index: number): boolean {
  return spans.some((s) => index >= s.start && index < s.end)
}

export function qualifyFormula(raw: string, scope: FormulaGateScope): FormulaGateVerdict {
  let body = raw.trim()
  if (!body) return fail('empty formula')
  if (body.startsWith('=')) body = body.slice(1).trim()
  if (!body) return fail('empty formula')
  if (body.length > MAX_FORMULA_LEN) return fail(`formula exceeds ${MAX_FORMULA_LEN} chars`)

  const lit = literalSpans(body)
  if (lit.unterminated) return fail('unterminated string literal')
  const spans = lit.spans

  for (const [ch, label] of [
    ['#', 'error literal or spill operator (#)'],
    ['@', 'implicit-intersection operator (@)'],
    [';', "locale argument separator (;) — Excel files use ','"],
    ['{', 'array constant ({...})'],
    ['}', 'array constant ({...})'],
    ['[', 'external link or structured reference ([...])'],
    [']', 'external link or structured reference ([...])']
  ] as Array<[string, string]>) {
    let at = body.indexOf(ch)
    while (at !== -1) {
      if (!inSpans(spans, at)) return fail(label)
      at = body.indexOf(ch, at + 1)
    }
  }

  // Same-sheet qualifiers are stripped; anything else fails.
  let gateError: string | null = null
  const qualifier =
    /('(?:[^']|'')+'|[A-Za-z0-9_.$]+)!\s*(\$?[A-Za-z]{1,3}\$?\d+|\$?[A-Za-z]{1,3}\s*:\s*\$?[A-Za-z]{1,3}|\$?\d+\s*:\s*\$?\d+)/g
  const out: string[] = []
  let cursor = 0
  for (;;) {
    const m = qualifier.exec(body)
    if (!m || gateError) break
    if (inSpans(spans, m.index)) continue
    const name = unquoteSheetName(m[1])
    if (!scope.sheetName || name.toLowerCase() !== scope.sheetName.toLowerCase()) {
      gateError = `cross-sheet reference (${m[1]}!)`
      break
    }
    const compact = m[2].replace(/\s+/g, '')
    if (/^\$?\d+:\$?\d+$/.test(compact)) {
      gateError = 'whole-row reference'
      break
    }
    if (/^\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}$/.test(compact)) {
      gateError = 'whole-column reference'
      break
    }
    out.push(body.slice(cursor, m.index), compact)
    cursor = m.index + m[0].length
  }
  if (gateError) return fail(gateError)
  out.push(body.slice(cursor))
  // Recompute literal spans: stripping qualifiers only removes text before
  // them, and lengths only shrink on the kept tail — recompute to stay exact.
  body = out.join('')
  const relit = literalSpans(body)
  if (relit.unterminated) return fail('unterminated string literal')
  const live = relit.spans

  const badChar = /[^\w.$+*/^&%(),: !<>= \t-]/g
  for (;;) {
    const m = badChar.exec(body)
    if (!m) break
    if (!inSpans(live, m.index)) return fail(`unsupported character '${m[0]}'`)
  }
  // The sweep above already rejects `!` and `'` outside literals; confirm.
  const bang = body.indexOf('!')
  if (bang !== -1 && !inSpans(live, bang)) return fail('sheet-qualified name')
  const quote = body.indexOf("'")
  if (quote !== -1 && !inSpans(live, quote)) return fail('unsupported quoting')

  let depth = 0
  for (let i = 0; i < body.length; i++) {
    if (inSpans(live, i)) continue
    const ch = body[i]
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth < 0) return fail('unbalanced parentheses')
    }
  }
  if (depth !== 0) return fail('unbalanced parentheses')

  // Bare whole-row / whole-column references (no sheet qualifier) would
  // survive rebasing with the wrong meaning — fail them before tokenizing.
  const bareRange = /(\$?\d+\s*:\s*\$?\d+|\$?[A-Za-z]{1,3}\s*:\s*\$?[A-Za-z]{1,3})/g
  for (;;) {
    const m = bareRange.exec(body)
    if (!m) break
    if (!inSpans(live, m.index)) return fail(`reference ${m[1].replace(/\s+/g, '')} is outside the exported range`)
  }

  const token =
    /([A-Za-z][A-Za-z0-9.]*)(?=\s*\()|(\$?[A-Za-z]{1,3}\$?\d+)|([A-Za-z_][A-Za-z0-9_.]*)|((?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)|(\$)/g
  const edits: Array<{ start: number; end: number; text: string }> = []
  for (;;) {
    const m = token.exec(body)
    if (!m) break
    const [full, fn, ref, name, , stray] = m
    const at = m.index
    if (inSpans(live, at)) continue
    if (stray) return fail("stray '$' outside a cell reference")
    const prev = at > 0 ? body[at - 1] : ''
    // A token glued to an identifier char (or a closing quote) is
    // juxtaposition, not a valid reference — e.g. `1A1`, `"x"A1`.
    if (/[A-Za-z0-9_."]/.test(prev)) return fail(`unexpected token near '${full}'`)
    if (fn) {
      const upper = fn.toUpperCase()
      if (!SAFE_FUNCTIONS.has(upper)) return fail(`function ${upper} is not Excel-safe`)
      // Normalize to Excel's canonical uppercase so exported formulas read
      // consistently regardless of how they were typed in Univer.
      if (fn !== upper) edits.push({ start: at, end: at + full.length, text: upper })
      continue
    }
    if (ref) {
      const parts = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(ref)
      if (!parts) return fail(`unparseable reference '${ref}'`)
      const col = colLettersToIndex(parts[2])
      const row = Number(parts[4]) - 1
      if (row < scope.startRow || row > scope.endRow || col < scope.startColumn || col > scope.endColumn) {
        return fail(`reference ${ref.toUpperCase()} is outside the exported range`)
      }
      const excel = `${parts[1]}${colIndexToLetters(col - scope.startColumn)}${parts[3]}${row - scope.startRow + 1}`
      edits.push({ start: at, end: at + full.length, text: excel })
      continue
    }
    if (name) {
      const upper = name.toUpperCase()
      if (upper !== 'TRUE' && upper !== 'FALSE') return fail(`unknown name '${name}'`)
    }
  }

  let excel = body
  for (let i = edits.length - 1; i >= 0; i--) {
    const e = edits[i]
    excel = excel.slice(0, e.start) + e.text + excel.slice(e.end)
  }
  return { ok: true, excel: `=${excel}` }
}
