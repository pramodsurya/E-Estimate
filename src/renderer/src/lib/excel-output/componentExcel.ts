/**
 * Component Statement Excel payload (native rust_xlsxwriter path — no ExcelJS).
 *
 * Mirrors the Typst algorithm in `../typist-output/componentTypst.ts`
 * (`buildComponentRenderData`): the same abstract rows (direct items numbered
 * 1..n, sub-component roll-ups prefixed S) feed the Abstract sheet, and the
 * same resolved signatures close the statement. Rate-analysis line detail is
 * NOT repeated here — the DATA workbook already owns per-recipe sheets.
 */
import type { ComponentRenderData } from '../typist-output/componentTypst'
import type { TypstDocData } from '../typist-output/documentTypst'
import {
  anchorImage,
  columnLabel,
  flattenDocument,
  flattenSheet,
  locateDocumentSourceCell,
  sanitizeSheetName,
  type CellRangeLike,
  type DetailGrid,
  type FormulaCellVerdict,
  type GridRichRun,
  type GridImageInput,
  type SheetSnapshotInput
} from './detailGrid'

export interface ComponentExcelAbstractRow {
  sl: string
  code: string
  heading: string
  description: string
  quantity: number | null
  unit: string
  rate: number | null
  amount: number | null
  subtotal: boolean
  /** Live reference to the detail quantity cell; null = static value. */
  qtyFormula?: string | null
  /** Qty × abstract rate cell; null = static value. */
  amountFormula?: string | null
}

export interface ComponentExcelSignature {
  designation: string
  office: string
}

export interface ComponentDetailSheetPayload {
  name: string
  grid: DetailGrid
  landscape?: boolean
}

export interface ComponentExcelPayload {
  projectName: string
  componentName: string
  componentCode: string
  isSubcomponent: boolean
  abstractRows: ComponentExcelAbstractRow[]
  totalCost: number
  signatures: ComponentExcelSignature[]
  detailSheets: ComponentDetailSheetPayload[]
  /** Single stacked sheet (Typst item order); null keeps the legacy per-item sheets. */
  detailedSheet: ComponentDetailSheetPayload | null
}

/**
 * Prepared per-item detail input. Built by the caller (dashboard, full
 * runtime): snapshots, ranges, parsed docs, measured images. This module
 * stays dependency-free so node tests load it without mocks.
 */
export interface PreparedDetailInput {
  /** Null entry = no detail sheet (template-generated item): index-aligned. */
  kind: 'sheet' | 'document' | null
  sheet?: SheetSnapshotInput
  range?: CellRangeLike | null
  doc?: TypstDocData | null
  images?: GridImageInput[]
  colWidthsPx?: number[]
  rowHeightsPx?: number[]
  /** Printed orientation selected for this item. */
  landscape?: boolean
  pageSetup?: DetailGrid['pageSetup']
  /** Adopted quantity cell in grid coords (rebased 0,0); null = value, no formula. */
  qtyRef?: { r: number; c: number } | null
  /** Fixed Univer text range that must map to its actual converted Excel cell. */
  documentFinal?: {
    startIndex: number
    endIndex: number
    value: number
    text: string
  } | null
  sheetNameHint?: string
}

export interface ComponentDetailSheet {
  name: string
  grid: DetailGrid
  qtyRef: { r: number; c: number } | null
  landscape: boolean
  /** Teacher verdicts for every formula cell on sheet-kind details. */
  formulaVerdicts: FormulaCellVerdict[]
}

/** Plain header facts per detail slot (dashboard maps its direct nodes). */
export interface DetailedItemHeader {
  code: string
  name: string
  unit: string
  description: string
  descriptionRuns?: GridRichRun[]
}

/** Node facts plus the Abstract direct row covering the same item. */
export interface DetailedHeaderSource {
  itemCode?: string | null
  displayName: string
  unit?: string | null
  itemDescription?: string | null
  abstractCode?: string
  abstractHeading?: string
  abstractUnit?: string
  abstractDescription?: string
  descriptionRuns?: GridRichRun[]
}

/**
 * Header facts prefer the node, then the Abstract's own direct row: recipe
 * items often carry code/description only in the Abstract, which is what
 * the estimator already sees. Covered by test-component-detailed.cjs.
 */
export function resolveDetailedHeaders(sources: DetailedHeaderSource[]): DetailedItemHeader[] {
  return sources.map((s) => {
    const header: DetailedItemHeader = {
      code: s.itemCode || s.abstractCode || '',
      name: s.displayName || s.abstractHeading || '',
      unit: s.unit || s.abstractUnit || '',
      description: s.itemDescription || s.abstractDescription || ''
    }
    if (s.descriptionRuns?.length) header.descriptionRuns = s.descriptionRuns
    return header
  })
}

export interface ComponentDetailedSheet {
  name: string
  grid: DetailGrid
  landscape: boolean
  /** Stacked qty cells, index-aligned with the details input (null = static). */
  qtyRefs: Array<{ r: number; c: number } | null>
}

/**
 * Stack every printable detail into ONE grid in Typst item order, with the
 * header block styled like the official STANDARD DATA book (Dam & Allied
 * Works sheet): narrow column A, code merged across A:B, Unit at the far
 * right, and a rich wrapped description directly below across the full
 * width. The item's untouched print-area grid starts at column B. Items are
 * separated by a blank gap row only — pagination is
 * left fully automatic to Excel, no forced page breaks. Null slots
 * (template-covered items) are skipped; all-null yields null so the caller
 * keeps the legacy sheets.
 */
export function buildComponentDetailedSheet(
  componentName: string,
  headers: DetailedItemHeader[],
  details: Array<ComponentDetailSheet | null>
): ComponentDetailedSheet | null {
  const blocks: Array<{ header: DetailedItemHeader; detail: ComponentDetailSheet }> = []
  for (let i = 0; i < details.length; i++) {
    const detail = details[i]
    if (detail) blocks.push({ header: headers[i] ?? { code: '', name: '', unit: '', description: '' }, detail })
  }
  if (blocks.length === 0) return null
  const name = sanitizeSheetName(`Detailed_${componentName}`)
  // Column A is deliberately narrow. The Univer grid begins untouched at B;
  // one additional content column guarantees room for Code A:B and Unit at
  // the far right even when the source grid has only one column.
  const contentWidth = Math.max(2, ...blocks.map((b) => b.detail.grid.colWidthsChars.length))
  const lastCol = contentWidth
  const colWidthsChars: number[] = [5.5]
  for (let c = 0; c < contentWidth; c++) {
    let w = 0
    for (const b of blocks) {
      const v = b.detail.grid.colWidthsChars[c]
      if (typeof v === 'number' && v > w) w = v
    }
    colWidthsChars.push(w > 0 ? w : 14)
  }
  const cells: DetailGrid['cells'] = []
  const merges: DetailGrid['merges'] = []
  const rowHeightsPt: DetailGrid['rowHeightsPt'] = []
  const images: DetailGrid['images'] = []
  const rowBreaks: number[] = []
  const qtyRefs: Array<{ r: number; c: number } | null> = details.map(() => null)

  const setH = (row: number, pt: number): void => {
    while (rowHeightsPt.length <= row) rowHeightsPt.push(null)
    rowHeightsPt[row] = pt
  }
  let r = 0
  const cleanRunText = (text: string): string => text.replace(/\s*[\r\n]+\s*/g, ' ')
  const wrapHeight = (text: string): number => {
    const available = Math.max(20, colWidthsChars.reduce((sum, width) => sum + width, 0) - 4)
    const words = text.trim().split(/\s+/).filter(Boolean)
    let lines = 1
    let used = 0
    for (const word of words) {
      const size = word.length + (used > 0 ? 1 : 0)
      if (used > 0 && used + size > available) {
        lines += 1
        used = word.length
      } else used += size
    }
    return Math.max(16.5, lines * 15)
  }
  blocks.forEach((block, bi) => {
    const { header, detail } = block
    const grid = detail.grid
    const codeStyle = { bold: true, sizePt: 10, fontName: 'Trebuchet MS', align: 'left' as const }
    const unitStyle = { sizePt: 10, fontName: 'Trebuchet MS', align: 'right' as const }
    cells.push({ r, c: 0, value: header.code || header.name, style: codeStyle })
    merges.push({ r1: r, c1: 0, r2: r, c2: 1 })
    if (header.unit) cells.push({ r, c: lastCol, value: `Unit: ${header.unit}`, style: unitStyle })
    setH(r, 15.75)
    r += 1
    const description = cleanRunText(header.description || header.name)
    const descriptionRuns = (header.descriptionRuns ?? [])
      .map((run) => ({ ...run, text: cleanRunText(run.text) }))
      .filter((run) => run.text.length > 0)
    if (description || descriptionRuns.length) {
      const displayText = descriptionRuns.length
        ? descriptionRuns.map((run) => run.text).join('')
        : description
      cells.push({
        r,
        c: 0,
        ...(descriptionRuns.length ? { runs: descriptionRuns } : { value: description }),
        style: { sizePt: 10, fontName: 'Trebuchet MS', align: 'left' as const, wrap: true }
      })
      merges.push({ r1: r, c1: 0, r2: r, c2: lastCol })
      setH(r, wrapHeight(displayText))
      r += 1
    }
    const gridStart = r
    for (const cell of grid.cells) {
      const isFinal = detail.qtyRef?.r === cell.r && detail.qtyRef?.c === cell.c
      cells.push({
        ...cell,
        r: cell.r + gridStart,
        c: cell.c + 1,
        ...(isFinal ? { style: { ...cell.style, bold: true, bgRgb: 'FFF2CC' } } : {})
      })
    }
    for (const m of grid.merges) {
      merges.push({
        r1: m.r1 + gridStart,
        c1: Math.min(m.c1 + 1, lastCol),
        r2: m.r2 + gridStart,
        c2: Math.min(m.c2 + 1, lastCol)
      })
    }
    for (const img of grid.images) images.push({ ...img, r: img.r + gridStart, c: img.c + 1 })
    // No explicit breaks: Excel keeps pagination automatic. Grid-level break
    // marks are intentionally not propagated into the stacked sheet.
    for (let i = 0; i < grid.rowHeightsPt.length; i++) {
      const h = grid.rowHeightsPt[i]
      if (h != null) setH(gridStart + i, h)
    }
    const depth = Math.max(
      -1,
      ...grid.cells.map((c) => c.r),
      ...grid.merges.map((m) => m.r2),
      ...grid.images.map((img) => img.r)
    ) + 1
    const slot = details.indexOf(detail)
    if (detail.qtyRef) qtyRefs[slot] = { r: detail.qtyRef.r + gridStart, c: detail.qtyRef.c + 1 }
    r = gridStart + depth
    if (bi < blocks.length - 1) {
      // Blank gap row between items, but no page break — pagination stays
      // automatic like the rest of Excel.
      setH(r, 8)
      r += 1
    }
  })
  return {
    name,
    grid: { cells, merges, colWidthsChars, rowHeightsPt, images, rowBreaks },
    // One Excel worksheet cannot change orientation between item blocks.
    // A wide item must not be clipped merely because a preceding item was
    // portrait, so the combined sheet is landscape when any block needs it.
    landscape: blocks.some((block) => block.detail.landscape),
    qtyRefs
  }
}

/**
 * Build detail sheets with unique sanitized names. Entries stay
 * index-aligned with the input (nulls pass through) so Abstract rows zip
 * correctly. Document images without flow positions land on their own rows
 * after content, in order (declared approximation).
 */
export function buildComponentDetailSheets(inputs: PreparedDetailInput[]): Array<ComponentDetailSheet | null> {
  const used = new Set<string>()
  const uniqueName = (hint: string): string => {
    const base = sanitizeSheetName(hint)
    if (!used.has(base)) {
      used.add(base)
      return base
    }
    let n = 2
    while (used.has(`${base.slice(0, 28)}_${n}`)) n += 1
    const name = `${base.slice(0, 28)}_${n}`
    used.add(name)
    return name
  }
  return inputs.map((input) => {
    if (!input || input.kind === null) return null
    const name = uniqueName(input.sheetNameHint || 'Detail')
    if (input.kind === 'sheet') {
      if (!input.sheet || !input.range) return null
      const formulaVerdicts: FormulaCellVerdict[] = []
      const grid = flattenSheet(input.sheet, input.range, { sheetName: name, verdicts: formulaVerdicts })
      grid.pageSetup = input.pageSetup
      if ((input.images ?? []).length && (input.colWidthsPx ?? []).length && (input.rowHeightsPx ?? []).length) {
        for (const img of input.images ?? []) {
          grid.images.push(anchorImage(input.colWidthsPx ?? [], input.rowHeightsPx ?? [], img))
        }
      }
      return { name, grid, qtyRef: input.qtyRef ?? null, landscape: input.landscape ?? true, formulaVerdicts }
    }
    if (!input.doc) return null
    const grid = flattenDocument(input.doc)
    grid.pageSetup = input.pageSetup
    let r = grid.cells.reduce((max, cell) => Math.max(max, cell.r), -1) + 1
    for (const img of input.images ?? []) {
      grid.images.push({ r, c: 0, dataBase64: img.dataBase64, mime: img.mime, scaleW: 1, scaleH: 1 })
      const rows = Math.max(1, Math.round(img.heightPx / 24))
      for (let i = 0; i < rows; i++) grid.rowHeightsPt[r + i] = 18
      r += rows
    }
    let qtyRef: { r: number; c: number } | null = null
    if (input.documentFinal) {
      const landed = locateDocumentSourceCell(
        input.doc,
        input.documentFinal.startIndex,
        input.documentFinal.endIndex
      )
      if (!landed) {
        throw new Error('Component Excel: the fixed document final number is outside the exported document area.')
      }
      let cell = grid.cells.find((candidate) => candidate.r === landed.ref.r && candidate.c === landed.ref.c)
      if (!cell) {
        throw new Error('Component Excel: the fixed document final number did not produce an Excel cell.')
      }
      // When the numeric-only selection owns its paragraph/table cell, that
      // converted cell is the precedent. If it is a numeric substring inside
      // surrounding document text, preserve the complete text and place a
      // dedicated numeric precedent on the same converted row. This derives
      // placement from the user's selection instead of appending a guessed
      // "final quantity" row at the end of the item.
      if (landed.text.trim() !== input.documentFinal.text.trim()) {
        const helperCol = grid.colWidthsChars.length
        grid.colWidthsChars.push(14)
        cell = {
          r: landed.ref.r,
          c: helperCol,
          value: input.documentFinal.value,
          numFmt: '0.00',
          style: { bgRgb: 'FFF2CC', align: 'right' }
        }
        grid.cells.push(cell)
        qtyRef = { r: landed.ref.r, c: helperCol }
      } else {
        qtyRef = landed.ref
      }
      cell.value = input.documentFinal.value
      cell.numFmt = '0.00'
      cell.style = { ...cell.style, bgRgb: 'FFF2CC', align: cell.style?.align ?? 'right' }
      delete cell.runs
    }
    return { name, grid, qtyRef, landscape: input.landscape ?? true, formulaVerdicts: [] }
  })
}

/** Excel row of the first Abstract data row (Rust header_at = 4, 0-based). */
const ABSTRACT_FIRST_DATA_EXCEL_ROW = 6

export interface ComponentQuantityOverride {
  sheet: string
  ref: { r: number; c: number }
}

function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

export function buildComponentExcelPayload(
  renderData: ComponentRenderData,
  details: Array<ComponentDetailSheet | null> = [],
  detailed: ComponentDetailedSheet | null = null,
  quantityOverrides: Array<ComponentQuantityOverride | null> = []
): ComponentExcelPayload {
  // Direct (non-S) abstract rows zip with details by index: both derive from
  // the same direct-items walk in the same order. Length mismatch degrades to
  // static values — never a wrong reference. With a stacked Detailed sheet
  // the quantities point into it via the remapped refs; otherwise each
  // quantity points at its own per-item sheet (legacy).
  let directIdx = -1
  const abstractRows = renderData.abstract.map((row, abstractIdx) => {
    const subtotal = row.sl.startsWith('S')
    let qtyFormula: string | null = null
    let amountFormula: string | null = null
    if (!subtotal) {
      directIdx += 1
      const override = quantityOverrides[directIdx] ?? null
      const stacked = detailed?.qtyRefs[directIdx] ?? null
      const detail = details[directIdx] ?? null
      const target = override ?? (stacked
        ? { sheet: detailed?.name ?? '', ref: stacked }
        : detail?.qtyRef
          ? { sheet: detail.name, ref: detail.qtyRef }
          : null)
      if (target) {
        const sheet = quoteSheetName(target.sheet)
        const qtyRef = `${sheet}!${columnLabel(target.ref.c)}${target.ref.r + 1}`
        qtyFormula = `=${qtyRef}`
        // Amount stays live off the referenced quantity and this row's rate
        // cell (column F of the Abstract sheet).
        amountFormula = `=${qtyRef}*F${ABSTRACT_FIRST_DATA_EXCEL_ROW + abstractIdx}`
      }
    }
    return {
      sl: row.sl,
      code: row.code,
      heading: row.heading,
      description: row.description,
      quantity: row.rawQty ?? null,
      unit: row.unit,
      rate: row.rawRate ?? null,
      amount: row.rawAmount ?? null,
      // By construction buildComponentRenderData numbers direct items 1..n
      // and prefixes sub-component roll-up rows with S.
      subtotal,
      qtyFormula,
      amountFormula
    }
  })
  return {
    projectName: renderData.project,
    componentName: renderData.component.name,
    componentCode: renderData.component.code,
    isSubcomponent: renderData.component.isSubcomponent,
    abstractRows,
    detailSheets: detailed
      ? []
      : details
        .filter((detail): detail is ComponentDetailSheet => detail !== null)
        .map((detail) => ({ name: detail.name, grid: detail.grid, landscape: detail.landscape })),
    detailedSheet: detailed ? { name: detailed.name, grid: detailed.grid, landscape: detailed.landscape } : null,
    totalCost: renderData.component.totalCost,
    signatures: renderData.signature.map((sig) => ({
      designation: sig.designation,
      office: sig.office
    }))
  }
}

export function componentExcelFileName(projectName: string, componentName: string): string {
  const clean = (value: string): string =>
    value.replace(/[\\/:*?"<>|]/g, '').trim() || 'Estimate'
  return `${clean(projectName)} — ${clean(componentName)} — Component Statement.xlsx`
}
