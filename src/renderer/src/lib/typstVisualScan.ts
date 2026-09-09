/**
 * Pure, framework-free scanner for E-Estimate Typst runtime expressions and the
 * semantic `#ee-group-table(...)` component. No CodeMirror imports — loadable by
 * plain Node for tests. This is the source-authoritative mapping: it finds the
 * exact source ranges that a visual layer replaces with widgets/chips.
 */

export type EeVariableExpression =
  | { form: 'ee-underscore'; name: string }   // #EE_YEAR
  | { form: 'ee-dot'; path: string }          // #EE.summary.grand_total
  | { form: 'r-path'; path: string }          // #r.description
  | { form: 'g-path'; path: string }          // #g.label

export interface VariableMatch {
  from: number
  to: number
  expression: string
  expr: EeVariableExpression
}

export interface EeTableHeaderCell {
  from: number
  to: number
  text: string
}

/** Resolve a dotted path against runtime data; return '' when missing. */
export function resolvePath(runtime: unknown, path: string): string {
  let value: unknown = runtime
  for (const key of path.split('.')) {
    if (value == null || typeof value !== 'object') return ''
    value = (value as Record<string, unknown>)[key]
  }
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return ''
}

/** `EE_YEAR` → `year`, `EE_PERMIT_BASIS` → `permit_basis`, `EE_SUMMARY.grand_total` → `summary.grand_total`. */
function eeNameToPath(name: string): string {
  return name.toLowerCase()
}

/** The runtime value + a human hint for an expression. */
export function valueFor(expr: EeVariableExpression, runtime: unknown): { value: string; title: string } {
  if (expr.form === 'ee-underscore') {
    const path = eeNameToPath(expr.name)
    return { value: resolvePath(runtime, path), title: `#EE_${expr.name} → ${path}` }
  }
  if (expr.form === 'ee-dot') return { value: resolvePath(runtime, expr.path), title: `#EE.${expr.path}` }
  if (expr.form === 'r-path') return { value: resolvePath(runtime, expr.path), title: `#r.${expr.path}` }
  return { value: resolvePath(runtime, expr.path), title: `#g.${expr.path}` }
}

const EE_VAR = /\#(EE_[A-Za-z0-9_]+(?:\.[A-Za-z0-9_.]+)?|EE\.[A-Za-z0-9_.]+|r\.[A-Za-z0-9_.]+|g\.[A-Za-z0-9_.]+)/g

/** Find every E-Estimate runtime expression and its source range. */
export function scanVariables(text: string): VariableMatch[] {
  const out: VariableMatch[] = []
  EE_VAR.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = EE_VAR.exec(text))) {
    const token = m[1]!
    const from = m.index
    const to = from + m[0].length
    if (token.startsWith('EE_')) {
      out.push({ from, to, expression: m[0], expr: { form: 'ee-underscore', name: token.slice(3) } })
    } else if (token.startsWith('EE.')) {
      out.push({ from, to, expression: m[0], expr: { form: 'ee-dot', path: token.slice(3) } })
    } else if (token.startsWith('r.')) {
      out.push({ from, to, expression: m[0], expr: { form: 'r-path', path: token.slice(2) } })
    } else {
      out.push({ from, to, expression: m[0], expr: { form: 'g-path', path: token.slice(2) } })
    }
  }
  return out
}

/** Balances a `(...)` list starting at the index of `(`; returns index of `)`. */
function matchParens(text: string, open: number): number {
  let depth = 1
  let quote = ''
  for (let i = open + 1; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
    if (ch === '(') depth++
    else if (ch === ')') { depth--; if (depth === 0) return i }
  }
  return -1
}

/** Header cell ranges inside the `headers: ([Sl], [Description], …)` argument.
 *  `from`/`to` cover the WHOLE `[...]` token (brackets included) so an edit can
 *  replace it cleanly; `text` is the inner content shown/edited.
 */
export function parseHeaderCells(source: string, bodyFrom: number, bodyTo: number): EeTableHeaderCell[] {
  const headers = source.slice(bodyFrom, bodyTo)
  const m = /headers\s*:\s*\(([\s\S]*)\)/.exec(headers)
  if (!m) return []
  const list = m[1]
  const cells: EeTableHeaderCell[] = []
  const listStart = bodyFrom + headers.indexOf(m[1])
  const re = /\[([^\]]*)\]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(list))) {
    const from = listStart + match.index
    const to = listStart + match.index + match[0].length
    if (match[0] === '[]') continue
    cells.push({ from, to, text: match[1] ?? '' })
  }
  return cells
}

export interface GroupTableMatch {
  from: number
  to: number
  bodyFrom: number
  bodyTo: number
  headers: EeTableHeaderCell[]
}

/** Find every whole `#ee-group-table(...)` call and its header ranges. */
export function scanGroupTable(text: string): GroupTableMatch[] {
  const out: GroupTableMatch[] = []
  const re = /\#ee-group-table\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1 // index of '('
    const close = matchParens(text, open)
    if (close < 0) continue
    const from = m.index
    const to = close + 1
    const bodyFrom = open + 1
    out.push({ from, to, bodyFrom, bodyTo: close, headers: parseHeaderCells(text, bodyFrom, close) })
  }
  return out
}
