import type { ProjectNode } from '../types/project'

/**
 * Cross-spreadsheet cell references: `=ITEMCELL("CON-12","C18")` reads a
 * cell from another item's sheet.
 *
 * Each item is its own Univer workbook, so native cross-workbook references
 * cannot work here (one workbook is mounted at a time). Instead the editor
 * registers ITEMCELL as a custom formula function backed by these pure
 * resolvers over the saved project tree. Values reflect the last saved
 * snapshot; the function reads raw cached values (never evaluates the
 * target cell's own formula), so references cannot recurse.
 */

export interface ParsedCellRef {
  row: number
  column: number
}

/** Parses `C18` (tolerates `$C$18` and lowercase) into zero-based indices. */
export function parseCellA1(ref: string | null | undefined): ParsedCellRef | null {
  const match = typeof ref === 'string' ? ref.trim().match(/^\$?([A-Za-z]+)\$?(\d+)$/) : null
  if (!match) return null
  const letters = match[1].toUpperCase()
  let column = 0
  for (const ch of letters) column = column * 26 + (ch.charCodeAt(0) - 64)
  column -= 1
  const row = Number(match[2]) - 1
  if (!Number.isInteger(row) || row < 0 || column < 0 || row > 999999) return null
  return { row, column }
}

/** Finds a unique item by code; duplicate codes need an explicit item ID. */
export function findItemByCode(root: ProjectNode, code: string | null | undefined): ProjectNode | null {
  const want = typeof code === 'string' ? code.trim().toLowerCase() : ''
  if (!want) return null
  let found: ProjectNode | null = null
  let ambiguous = false
  const visit = (node: ProjectNode): void => {
    if (ambiguous) return
    if (node.kind === 'item' && typeof node.itemCode === 'string' && node.itemCode.trim().toLowerCase() === want) {
      if (found) ambiguous = true
      else found = node
    }
    node.children.forEach(visit)
  }
  visit(root)
  return ambiguous ? null : found
}

/** IDs distinguish items that share an item code in different components. */
export function findItemById(root: ProjectNode, id: string | null | undefined): ProjectNode | null {
  if (!id) return null
  if (root.kind === 'item' && root.id === id) return root
  for (const child of root.children) {
    const found = findItemById(child, id)
    if (found) return found
  }
  return null
}

export function parseCellRange(ref: string | null | undefined): { start: ParsedCellRef; end: ParsedCellRef } | null {
  if (typeof ref !== 'string') return null
  const parts = ref.split(':')
  if (parts.length < 1 || parts.length > 2) return null
  const a = parseCellA1(parts[0])
  const b = parseCellA1(parts[1] ?? parts[0])
  if (!a || !b) return null
  return {
    start: { row: Math.min(a.row, b.row), column: Math.min(a.column, b.column) },
    end: { row: Math.max(a.row, b.row), column: Math.max(a.column, b.column) }
  }
}

function firstSheetCell(snapshot: unknown, row: number, column: number): unknown {
  if (!snapshot || typeof snapshot !== 'object') return undefined
  const snap = snapshot as {
    sheetOrder?: string[]
    sheets?: Record<string, { cellData?: Record<string, Record<string, { v?: unknown }>> }>
  }
  const sheets = snap.sheets
  if (!sheets || typeof sheets !== 'object') return undefined
  const firstId = Array.isArray(snap.sheetOrder) ? snap.sheetOrder[0] : undefined
  const sheet = (firstId && sheets[firstId]) || Object.values(sheets)[0]
  return sheet?.cellData?.[row]?.[column]?.v
}

export type ItemCellError = 'REF' | 'VALUE'

export interface ItemCellResolution {
  ok: boolean
  /** Raw primitive when ok; absent cells resolve to 0 (Excel behaviour). */
  value?: number | string | boolean
  error?: ItemCellError
}

/**
 * Resolves one cross-sheet read. Unknown item code -> REF (bad reference);
 * malformed address or non-primitive content -> VALUE; missing/empty cell -> 0.
 */
export function resolveItemCell(
  root: ProjectNode,
  code: string | null | undefined,
  ref: string | null | undefined,
  itemId?: string | null
): ItemCellResolution {
  const item = itemId ? findItemById(root, itemId) : findItemByCode(root, code)
  if (!item) return { ok: false, error: 'REF' }
  const parsed = parseCellA1(ref)
  if (!parsed) return { ok: false, error: 'VALUE' }
  const raw = firstSheetCell(item.spreadsheet, parsed.row, parsed.column)
  if (raw === undefined || raw === null) return { ok: true, value: 0 }
  if (typeof raw === 'number' || typeof raw === 'string' || typeof raw === 'boolean') {
    return { ok: true, value: raw }
  }
  return { ok: false, error: 'VALUE' }
}

export function resolveItemRange(
  root: ProjectNode,
  code: string | null | undefined,
  ref: string | null | undefined,
  itemId?: string | null
): { ok: true; values: Array<Array<number | string | boolean | null>> } | { ok: false; error: ItemCellError } {
  const item = itemId ? findItemById(root, itemId) : findItemByCode(root, code)
  if (!item) return { ok: false, error: 'REF' }
  const range = parseCellRange(ref)
  if (!range) return { ok: false, error: 'VALUE' }
  const rows = range.end.row - range.start.row + 1
  const cols = range.end.column - range.start.column + 1
  if (rows * cols > 10000) return { ok: false, error: 'VALUE' }
  const values: Array<Array<number | string | boolean | null>> = []
  for (let row = range.start.row; row <= range.end.row; row++) {
    const cells: Array<number | string | boolean | null> = []
    for (let column = range.start.column; column <= range.end.column; column++) {
      const raw = firstSheetCell(item.spreadsheet, row, column)
      if (raw !== undefined && raw !== null && typeof raw !== 'number' && typeof raw !== 'string' && typeof raw !== 'boolean') {
        return { ok: false, error: 'VALUE' }
      }
      cells.push(raw === undefined ? null : raw as number | string | boolean | null)
    }
    values.push(cells)
  }
  return { ok: true, values }
}

/** Builds the formula text, e.g. `=ITEMCELL("CON-12","C18")`. */
export function itemCellFormula(code: string, ref: string, itemId?: string): string {
  const address = ref.trim().toUpperCase()
  const args = `${JSON.stringify(code.trim())},${JSON.stringify(address)}${itemId ? `,${JSON.stringify(itemId)}` : ''}`
  return `=ITEMCELL(${args})`
}

/**
 * Appends a picked reference to a pending formula (Excel point mode). After
 * an operator, paren, or comma it joins directly; after a value it inserts
 * `+` (bare `=2` + click becomes `=2+REF`, never the invalid `=2REF`).
 */
export function appendFormulaRef(text: string, ref: string): string {
  if (!text || text === '=') return `${text}${ref}`
  const last = text[text.length - 1]
  if ('+-*/^(),'.includes(last) || last === '(') return `${text}${ref}`
  return `${text}+${ref}`
}

/** A correction replaces the current pick; an operator starts a new one. */
export function replacePickedFormulaRef(
  text: string,
  lastPickStart: number | undefined,
  ref: string
): { text: string; lastPickStart: number } {
  const prefix = lastPickStart === undefined ? text : text.slice(0, lastPickStart)
  const next = appendFormulaRef(prefix, ref)
  return { text: next, lastPickStart: next.length - ref.length }
}

/** Keeps the unfinished expression while Univer closes its editor on navigation. */
export function advancePendingFormulaFromKey(text: string, key: string): string | null {
  if (key === 'Backspace') return text.slice(0, -1) || '='
  return key.length === 1 ? `${text}${key}` : null
}

export interface ItemCodeOption {
  code: string
  label: string
}

/** Every codified item in the tree, for the insert-reference picker. */
export function collectItemCodes(root: ProjectNode): ItemCodeOption[] {
  const seen = new Set<string>()
  const out: ItemCodeOption[] = []
  const visit = (node: ProjectNode): void => {
    if (node.kind === 'item' && typeof node.itemCode === 'string' && node.itemCode.trim()) {
      const code = node.itemCode.trim()
      if (!seen.has(code.toLowerCase())) {
        seen.add(code.toLowerCase())
        const detail = node.itemDescription ?? node.name
        out.push({ code, label: detail && detail !== code ? `${code} — ${detail}` : code })
      }
    }
    node.children.forEach(visit)
  }
  visit(root)
  return out
}
