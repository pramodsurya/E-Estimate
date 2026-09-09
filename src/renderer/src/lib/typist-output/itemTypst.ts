/**
 * Single-item, spreadsheet-only Typst document.
 *
 * This is the same "runtime-data is variable, everything else is layout" pattern
 * as the Lead and Seigniorage statements, but scoped to one item's sheet.
 *
 * The SHEET ITSELF is content. Rather than flattening cells into a thin data
 * dump, the table body is rendered faithfully through `worksheetToTypst` — the
 * Typst twin of the HTML print path (`lib/printRender.ts`). Gridlines, fills,
 * borders, merges, rich text, number formats, column widths and wrapping are all
 * preserved, so the printed grid looks exactly like the spreadsheet.
 *
 * LAYOUT (title banner, project/description/unit header, page setup, signature
 * block) is CODE in this stable template. Item identity (name, code, unit,
 * description) and the signature rows are VARIABLE — handed to the compiler as
 * the `ee-data` input, so a restyled layout keeps them intact and any new rows
 * the estimator types still appear when the sheet is re-compiled.
 *
 * A saved per-item template is stored in
 * `project.printStudioDocuments['item-sheet-<nodeId>']`.
 */

import defaultItemTemplate from './item.typ?raw'
import defaultItemDocTemplate from './itemdoc.typ?raw'
import univerSheetPrelude from './univerSheet.typ?raw'
import univerDocPrelude from './univerDoc.typ?raw'
import type { CellRange, EestimateProject, Margins, PrintConfig, ProjectNode } from '../../types/project'
import {
  extractDocumentMedia,
  parseDocumentToTypstData,
  type TypstDocData
} from './documentTypst'
import { computeUsedRange, PAPER_MM, PX_PER_MM } from '../printRender'
import {
  worksheetToTypst,
  extractSheetImages,
  type SheetTypstOptions,
  type WorksheetSnapshotLike
} from './worksheetTypst'
import { createUniverWorkbookData, usedCellRange } from '../univerSpreadsheet'
import { nodeDisplayName } from '../../components/nodeVisual'
import { getItemRate, readFinalValueFromSnapshot } from '../finalNumber'
import {
  applyDocumentSettingsToTypst,
  normalizeDocumentSettings,
  resolveProjectDocumentSettings,
  type DocumentSettings
} from './documentSettings'
import { resolveNodeSettings } from '../nodeSettings'
import { resolveSignatureFooter } from '../signatureFooter'
import { rateAnalysisOverrideForNode } from '../projectItems'
import { descriptionRunsForDisplay, plainTextRun } from '../rateAnalysisVisibility'
import { dashboardContextMatches, dashboardItemIsSynced } from '../dashboardSync'
import type { RateAnalysisTextRun } from '../../types/rateAnalysis'

/* ------------------------------------------------------------------ */
/* Data contract                                                       */
/* ------------------------------------------------------------------ */

/** Typst `#set page(...)` geometry, exposed as data so the layout owns the page. */
export interface ItemSheetSetupData {
  /** Lower-cased Typst paper name, e.g. "a4". */
  paper: string
  /** True for landscape (Typst's `flipped`). */
  flipped: boolean
  /** Margins in millimetres. */
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
  /** Effective printable (content) width in millimetres. */
  contentWidthMm: number
  /** Base body size in points. */
  fontSizePt: number
  /** Resolved font family (a stack Typst `font(...)` accepts). */
  fontFamily: string[]
}

export interface ItemMediaItem {
  id: string
  name: string
  path: string
  left: number
  top: number
  relLeftPx: number
  relTopPx: number
  width: number
  height: number
  type: 'drawing' | 'chart'
  typstSnippet: string
  previewUrl?: string
}

export interface ExtractedMedia {
  shadowFiles: Record<string, string>
  images: ItemMediaItem[]
  gallery: ItemMediaItem[]
}

/** Item identity + signature, the variable content a restyled layout keeps. */
export interface ItemSheetRenderData {
  project: string
  /** The item's display name (its heading). */
  item: string
  code: string
  unit: string
  description: string
  /** Rich formatting runs (bold, italic, underline) from rate analysis recipe or parsed rich text */
  descriptionRuns: RateAnalysisTextRun[]
  /** The item's fixed final number (kept as data; the default layout need not show it). */
  final: {
    qty: string
    rate: string
    amount: string
    unit: string
  }
  /** Page geometry — variable, so the layout code controls the page too. */
  setup: ItemSheetSetupData
  signature: Array<{ designation: string; office: string }>
  /** Raw Univer workbook snapshot for native Typst rendering */
  univer: unknown
  /** Parsed Univer document representation for native Typst rendering */
  document?: TypstDocData
  /** Images and charts to float over the spreadsheet */
  images: ItemMediaItem[]
  /** Media gallery for user inspection and AI prompt generation in Print Studio */
  gallery: ItemMediaItem[]
  printConfig: {
    showGridlines: boolean
    repeatHeaderRows: number
    showRowColHeaders: boolean
    range: CellRange | null
  }
}

export function itemSheetScopeKey(node: ProjectNode): string {
  return node.itemEditorType === 'document' || node.kind === 'page'
    ? `item-doc-${node.id}`
    : `item-sheet-${node.id}`
}

/* ------------------------------------------------------------------ */
/* Item sheet config + effective print area                            */
/* ------------------------------------------------------------------ */

function itemPrintConfig(item: ProjectNode): PrintConfig {
  const isDoc = item.itemEditorType === 'document'
  const fallbackRange = isDoc ? null : (usedCellRange(item.spreadsheet, item.finalCell) ?? null)
  return {
    range: item.print?.range ?? fallbackRange,
    pageSize: item.print?.pageSize,
    orientation: item.print?.orientation,
    margins: item.print?.margins,
    scaleMode: item.print?.scaleMode,
    scalePercent: item.print?.scalePercent,
    fitToWidthPages: item.print?.fitToWidthPages,
    repeatHeaderRows: item.print?.repeatHeaderRows ?? 0,
    showRowColHeaders: item.print?.showRowColHeaders ?? false,
    showGridlines: item.print?.showGridlines ?? true
  }
}

/** Resolve the config merged with the node's inherited page settings. */
function resolveItemConfig(project: EestimateProject, item: ProjectNode): PrintConfig {
  const inherited = resolveNodeSettings(project.root, item.id)
  const own = itemPrintConfig(item)
  return {
    ...own,
    pageSize: own.pageSize ?? inherited.pageSize,
    orientation: own.orientation ?? inherited.orientation,
    margins: own.margins ?? inherited.margins,
    repeatHeaderRows: own.repeatHeaderRows ?? 0,
    showRowColHeaders: own.showRowColHeaders ?? false,
    showGridlines: own.showGridlines ?? true
  }
}

/** The column fit-scale: widths shrink to the printable area, never stretch. */
function columnScaleFor(
  snapshot: WorksheetSnapshotLike,
  config: PrintConfig,
  settings: DocumentSettings
): number {
  const sheet = (snapshot.sheets?.[snapshot.sheetOrder?.[0] ?? ''] ??
    Object.values(snapshot.sheets ?? {})[0]) as
    | { columnData?: Record<number, { w?: number; hd?: number }>; defaultColumnWidth?: number }
    | undefined
  const range = config.range ?? computeUsedRange(
    sheet as unknown as Parameters<typeof computeUsedRange>[0]
  )
  if (!sheet || !range) return 1
  const defColW = sheet.defaultColumnWidth ?? 88
  let contentMm = 0
  for (let c = range.startColumn; c <= range.endColumn; c += 1) {
    contentMm += (sheet.columnData?.[c]?.w ?? defColW) / PX_PER_MM
  }
  const paper = PAPER_MM[settings.pageSize]
  const printableWmm =
    (settings.orientation === 'landscape' ? paper.h : paper.w) -
    settings.margins.left -
    settings.margins.right
  return contentMm > 0 && printableWmm > 0 ? Math.min(1, printableWmm / contentMm) : 1
}

/* ------------------------------------------------------------------ */
/* Render data builder                                                 */
/* ------------------------------------------------------------------ */

function fmtQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
}

function fmtMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Typst `font(...)` stacks for each DocumentSettings font family. */
const FONT_STACKS: Record<DocumentSettings['fontFamily'], string[]> = {
  times: ['Times New Roman', 'Liberation Serif', 'Noto Serif'],
  sans: ['Calibri', 'Arial', 'Liberation Sans', 'Helvetica'],
  arial: ['Arial', 'Liberation Sans', 'Helvetica'],
  georgia: ['Georgia', 'Liberation Serif', 'Noto Serif'],
  'source-sans': ['Source Sans 3', 'Source Sans Pro', 'Arial', 'Liberation Sans'],
  'source-serif': ['Source Serif 4', 'Source Serif Pro', 'Times New Roman', 'Liberation Serif']
}

/** Derive the page-geometry data the layout owns, from effective settings. */
function setupFromSettings(settings: DocumentSettings): ItemSheetSetupData {
  const paper = PAPER_MM[settings.pageSize]
  const flipped = settings.orientation === 'landscape'
  const contentWidthMm =
    (flipped ? paper.h : paper.w) - settings.margins.left - settings.margins.right
  return {
    paper: settings.pageSize.toLowerCase(),
    flipped,
    marginTop: settings.margins.top,
    marginRight: settings.margins.right,
    marginBottom: settings.margins.bottom,
    marginLeft: settings.margins.left,
    contentWidthMm,
    fontSizePt: settings.fontSizePt,
    fontFamily: FONT_STACKS[settings.fontFamily]
  }
}

/** Extract sheet drawings and anchored Chart.js graphs into shadow file paths and media metadata. */
export function extractItemMedia(
  item: ProjectNode,
  range?: CellRange | null,
  options?: { scopePrefix?: boolean }
): ExtractedMedia {
  if (item.itemEditorType === 'document' || item.kind === 'page') {
    return extractDocumentMedia(item)
  }
  const snapshot = createUniverWorkbookData(item) as WorksheetSnapshotLike
  const sheet = (snapshot.sheets?.[snapshot.sheetOrder?.[0] ?? ''] ??
    Object.values(snapshot.sheets ?? {})[0]) as
    | {
        columnData?: Record<number, { w?: number; hd?: number }>
        rowData?: Record<number, { h?: number; ah?: number; hd?: number }>
        defaultColumnWidth?: number
        defaultRowHeight?: number
      }
    | undefined

  const shadowFiles: Record<string, string> = {}
  const images: ItemMediaItem[] = []
  const gallery: ItemMediaItem[] = []

  let rangeLeft = 0
  let rangeTop = 0
  if (range && sheet) {
    const defW = sheet.defaultColumnWidth ?? 88
    for (let c = 0; c < range.startColumn; c++) {
      if (sheet.columnData?.[c]?.hd === 1) continue
      rangeLeft += sheet.columnData?.[c]?.w ?? defW
    }
    const defH = sheet.defaultRowHeight ?? 24
    for (let r = 0; r < range.startRow; r++) {
      if (sheet.rowData?.[r]?.hd === 1) continue
      rangeTop += sheet.rowData?.[r]?.ah ?? sheet.rowData?.[r]?.h ?? defH
    }
  }

  const itemPrefix = item.id ? `${item.id.replace(/[^a-zA-Z0-9_-]/g, '_')}_` : ''
  const usePrefix = options?.scopePrefix === true

  // 1. Univer sheet drawings
  const sheetImages = extractSheetImages(snapshot)
  sheetImages.forEach((img, idx) => {
    const id = `drawing_${idx + 1}`
    const scopedPath = `images/${itemPrefix}sheet_drawing_${idx + 1}.png`
    const legacyPath = `images/sheet_drawing_${idx + 1}.png`
    const chosenPath = usePrefix ? scopedPath : legacyPath
    shadowFiles[scopedPath] = img.source
    shadowFiles[legacyPath] = img.source
    const relLeftPx = Math.round(Math.max(0, img.left - rangeLeft))
    const relTopPx = Math.round(Math.max(0, img.top - rangeTop))
    const widthPt = (img.width * 0.75).toFixed(1)
    const heightPt = (img.height * 0.75).toFixed(1)
    const dxPt = (relLeftPx * 0.75).toFixed(1)
    const dyPt = (relTopPx * 0.75).toFixed(1)

    const mediaItem: ItemMediaItem = {
      id,
      name: `Sheet Drawing ${idx + 1}`,
      path: chosenPath,
      left: img.left,
      top: img.top,
      relLeftPx,
      relTopPx,
      width: img.width,
      height: img.height,
      type: 'drawing',
      typstSnippet: `#place(top + left, dx: ${dxPt}pt, dy: ${dyPt}pt, image("${chosenPath}", width: ${widthPt}pt, height: ${heightPt}pt))`,
      previewUrl: img.source
    }
    images.push(mediaItem)
    gallery.push(mediaItem)
  })

  // 2. Charts anchored to this item
  const charts = item.charts ?? []
  charts.forEach((ch, idx) => {
    if (!ch.png) return
    const id = ch.id || `chart_${idx + 1}`
    const scopedPath = `images/${itemPrefix}chart_${idx + 1}.png`
    const legacyPath = `images/chart_${idx + 1}.png`
    const chosenPath = usePrefix ? scopedPath : legacyPath
    shadowFiles[scopedPath] = ch.png
    shadowFiles[legacyPath] = ch.png
    const relLeftPx = Math.round(Math.max(0, ch.position.startX - rangeLeft))
    const relTopPx = Math.round(Math.max(0, ch.position.startY - rangeTop))
    const widthPt = (ch.position.width * 0.75).toFixed(1)
    const heightPt = (ch.position.height * 0.75).toFixed(1)
    const dxPt = (relLeftPx * 0.75).toFixed(1)
    const dyPt = (relTopPx * 0.75).toFixed(1)

    const mediaItem: ItemMediaItem = {
      id,
      name: ch.title || `Chart ${idx + 1} (${ch.type})`,
      path: chosenPath,
      left: ch.position.startX,
      top: ch.position.startY,
      relLeftPx,
      relTopPx,
      width: ch.position.width,
      height: ch.position.height,
      type: 'chart',
      typstSnippet: `#place(top + left, dx: ${dxPt}pt, dy: ${dyPt}pt, image("${chosenPath}", width: ${widthPt}pt, height: ${heightPt}pt))`,
      previewUrl: ch.png
    }
    images.push(mediaItem)
    gallery.push(mediaItem)
  })

  return { shadowFiles, images, gallery }
}

/** Virtual in-memory files (Base64 buffers) mapped into Typst's shadow filesystem for compilation. */
export function itemSheetShadowFiles(
  item: ProjectNode,
  range?: CellRange | null,
  options?: { scopePrefix?: boolean }
): Record<string, string> {
  if (item.itemEditorType === 'document') {
    return extractDocumentMedia(item).shadowFiles
  }
  return extractItemMedia(item, range, options).shadowFiles
}

export function stripRichFormatting(input: string): string {
  if (!input) return ''
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/\*\*|__|\*|_/g, '')
    .trim()
}

export function parseDescriptionToRuns(input: string): RateAnalysisTextRun[] {
  if (!input) return []

  // Check if string contains HTML tags
  if (/<[a-z][\s\S]*>/i.test(input)) {
    const runs: RateAnalysisTextRun[] = []
    const regex = /<\/?([a-z]+)[^>]*>|[^<]+/gi
    let match: RegExpExecArray | null
    let bold = false
    let italic = false
    let underline = false

    while ((match = regex.exec(input)) !== null) {
      const token = match[0]
      if (token.startsWith('<')) {
        const isClosing = token.startsWith('</')
        const tag = (match[1] || '').toLowerCase()
        if (tag === 'b' || tag === 'strong') bold = !isClosing
        else if (tag === 'i' || tag === 'em') italic = !isClosing
        else if (tag === 'u') underline = !isClosing
        else if (tag === 'br') {
          runs.push({ text: '\n', bold, italic, underline })
        }
      } else {
        runs.push({ text: token, bold, italic, underline })
      }
    }
    return runs.filter((r) => r.text.length > 0)
  }

  // Check if string contains Markdown **bold** or *italic*
  if (/\*\*|__|\*|_/.test(input)) {
    const runs: RateAnalysisTextRun[] = []
    const mdRegex = /(\*\*|__)(.*?)\1|(\*|_)(.*?)\3|([^*_]+)/gs
    let match: RegExpExecArray | null
    while ((match = mdRegex.exec(input)) !== null) {
      if (match[2] !== undefined) {
        runs.push({ text: match[2], bold: true, italic: false, underline: false })
      } else if (match[4] !== undefined) {
        runs.push({ text: match[4], bold: false, italic: true, underline: false })
      } else if (match[5] !== undefined) {
        runs.push({ text: match[5], bold: false, italic: false, underline: false })
      }
    }
    return runs.filter((r) => r.text.length > 0)
  }

  return [plainTextRun(input)]
}

export function resolveItemDescriptionRuns(
  project: EestimateProject,
  item: ProjectNode
): RateAnalysisTextRun[] {
  // 1. Check if rate analysis recipe provides published/edited description runs (e.g. government SSR with bold clauses)
  const recipe =
    rateAnalysisOverrideForNode(project, item) ??
    (dashboardContextMatches(project.dashboardSnapshot, project) &&
    dashboardItemIsSynced(project.dashboardSnapshot, item)
      ? project.dashboardSnapshot?.recipes[item.id]
      : undefined)

  if (recipe?.layout?.descriptionRuns && recipe.layout.descriptionRuns.length > 0) {
    return descriptionRunsForDisplay(recipe.description, recipe.layout.descriptionRuns)
  }

  // 2. Check if projectData or node has description
  const projectDataDef = item.projectDataId
    ? project.projectData?.find((d) => d.id === item.projectDataId)
    : undefined

  const rawText =
    projectDataDef?.description ||
    item.itemDescription ||
    nodeDisplayName(item)

  return parseDescriptionToRuns(rawText)
}

/** Build the runtime data object (identity + signature + page setup + univer + media). */
export function buildItemSheetRenderData(
  project: EestimateProject,
  item: ProjectNode
): ItemSheetRenderData {
  const qty = readFinalValueFromSnapshot(item)
  const rate = getItemRate(project, item)
  const amount = qty != null && rate != null ? qty * rate : null
  const signature = resolveSignatureFooter(project, item.id)
  const settings = resolveItemSheetDocumentSettings(project, item)
  const config = resolveItemConfig(project, item)
  const isDocument = item.itemEditorType === 'document' || item.kind === 'page'
  const snapshot = isDocument ? null : createUniverWorkbookData(item)
  const media = isDocument ? extractDocumentMedia(item) : extractItemMedia(item, config.range)
  const docData = isDocument
    ? parseDocumentToTypstData(item.documentData, item.documentPrintArea, item.documentFinal)
    : undefined

  const projectDataDef = item.projectDataId
    ? project.projectData?.find((d) => d.id === item.projectDataId)
    : undefined
  const resolvedCode = item.itemCode || projectDataDef?.code || ''
  const resolvedUnit = item.unit || projectDataDef?.unit || ''
  const resolvedDesc =
    projectDataDef?.description ||
    item.itemDescription ||
    nodeDisplayName(item)

  const descriptionRuns = resolveItemDescriptionRuns(project, item)
  const cleanDescription = stripRichFormatting(resolvedDesc)

  return {
    project: project.meta.name || project.root.name || 'Detailed Estimate',
    item: nodeDisplayName(item),
    code: resolvedCode,
    unit: resolvedUnit,
    description: cleanDescription,
    descriptionRuns,
    setup: setupFromSettings(settings),
    final: {
      qty: fmtQty(qty),
      rate: rate != null ? fmtMoney(rate) : '—',
      amount: amount != null ? fmtMoney(amount) : '—',
      unit: item.unit || ''
    },
    signature: signature?.enabled
      ? signature.rows.map((row) => ({ designation: row.designation, office: row.office }))
      : [],
    univer: snapshot,
    document: docData,
    images: media.images,
    gallery: media.gallery,
    printConfig: {
      showGridlines: isDocument ? false : (config.showGridlines ?? true),
      repeatHeaderRows: isDocument ? 0 : (config.repeatHeaderRows ?? 0),
      showRowColHeaders: isDocument ? false : (config.showRowColHeaders ?? false),
      range: isDocument ? null : (config.range ?? null)
    }
  }
}

/** The `inputs` map handed to the Typst compiler on preview/export. */
export function itemSheetCompileInputs(
  project: EestimateProject,
  item: ProjectNode
): Record<string, string> {
  return { 'ee-data': JSON.stringify(buildItemSheetRenderData(project, item)) }
}

/* ------------------------------------------------------------------ */
/* Stable user template & helpers                                      */
/* ------------------------------------------------------------------ */

export const EE_ITEM_TABLE_PRELUDE = `// Signature rows share the same flat-cell + spread pattern: each row is one cell.
#let signature-cells(rows) = {
  let cells = ()
  for s in rows {
    cells.push([
      #text(weight: "bold")[#s.designation]
      #linebreak()
      #s.office
    ])
  }
  cells
}

// Shared low-ink sign-off rail. A single fractional-height block reserves the
// remaining page area and bottom-aligns the rail without consuming the page
// first (a separate v(1fr) would push the rail onto a blank page).
#let signature-footer(rows) = if rows.len() > 0 {
  block(width: 100%, height: 1fr, breakable: false)[
    #align(bottom)[
      #line(length: 100%, stroke: 0.65pt + rgb("#6f7d85"))
      #v(3mm)
      #grid(
        columns: (1fr,) * rows.len(), gutter: 10mm, align: center,
        ..rows.map(signatory => [
          #v(11mm)
          #line(length: 82%, stroke: 0.7pt + rgb("#273b47"))
          #v(2mm)
          #text(9pt, weight: "bold", fill: rgb("#172f3d"))[#signatory.designation]
          #if signatory.office != "" [#linebreak() #text(8pt, fill: rgb("#596a73"))[#signatory.office]]
        ]))
    ]
  ]
}

// Renders rich text runs (bold, italic, underline, linebreaks) preserving formatting from DATA
#let render-runs(runs) = {
  for r in runs {
    let t = r.text
    let lines = t.split("\\n")
    for (i, line) in lines.enumerate() {
      if i > 0 { linebreak() }
      let c = [#line]
      if r.at("bold", default: false) { c = strong(c) }
      if r.at("italic", default: false) { c = emph(c) }
      if r.at("underline", default: false) { c = underline(c) }
      c
    }
  }
}

// Renders WhatsApp-style markup (*bold*, _italic_, *_bold-italic_*, <u>underline</u>) directly in Typst
#let render-markup(t) = {
  if t == none or t == "" { return [] }
  let str-val = str(t)
  let lines = str-val.split("\\n")
  for (line-idx, line) in lines.enumerate() {
    if line-idx > 0 { linebreak() }
    let pos = 0
    let matches = line.matches(regex("(\\*_[^*_\\n]+_\\*|_\\*[^*_\\n]+\\*_|_([^_\\n]+)_|\\*([^*\\n]+)\\*|<u>([^<\\n]+)<\\/u>)"))
    if matches.len() == 0 {
      [#line]
    } else {
      for m in matches {
        if m.start > pos {
          [#line.slice(pos, m.start)]
        }
        let matched-text = m.text
        if (matched-text.starts-with("*_") and matched-text.ends-with("_*")) or (matched-text.starts-with("_*") and matched-text.ends-with("*_")) {
          strong(emph(matched-text.slice(2, -2)))
        } else if matched-text.starts-with("*") and matched-text.ends-with("*") {
          strong(matched-text.slice(1, -1))
        } else if matched-text.starts-with("_") and matched-text.ends-with("_") {
          emph(matched-text.slice(1, -1))
        } else if matched-text.starts-with("<u>") and matched-text.ends-with("</u>") {
          underline(matched-text.slice(3, -4))
        } else {
          [#matched-text]
        }
        pos = m.end
      }
      if pos < line.len() {
        [#line.slice(pos)]
      }
    }
  }
}

// Renders the item description with all rich formatting (bolds, underlines, italics) from DATA
#let render-description(ee) = {
  let runs = ee.at("descriptionRuns", default: ())
  if runs.len() > 0 {
    render-runs(runs)
  } else if ee.at("description", default: "") != "" {
    render-markup(ee.description)
  }
}

${univerSheetPrelude}

${univerDocPrelude}
`

/**
 * Returns the default user-editable single-item Typst template.
 * For spreadsheet items: item.typ
 * For document items: itemdoc.typ
 */
export function itemSheetTypstTemplate(
  _project?: EestimateProject,
  item?: ProjectNode
): string {
  if (item?.itemEditorType === 'document' || item?.kind === 'page') {
    return defaultItemDocTemplate
  }
  return defaultItemTemplate
}

/* ------------------------------------------------------------------ */
/* Document settings                                                   */
/* ------------------------------------------------------------------ */

export function resolveItemSheetDocumentSettings(
  project: EestimateProject,
  item: ProjectNode
): DocumentSettings {
  const base = resolveProjectDocumentSettings(project.projectPrintSettings)
  const nodeSettings = resolveNodeSettings(project.root, item.id)
  return normalizeDocumentSettings(
    {
      pageSize: nodeSettings.pageSize,
      orientation: nodeSettings.orientation,
      margins: nodeSettings.margins as Margins
    },
    base
  )
}

/**
 * Returns the effective Typst source for an item sheet, prepending the hidden
 * app-owned prelude so the user template stays clean. The page setup is directly
 * injected into the template as concrete Typst settings (#set page / #set text).
 */
export function resolvedItemSheetTypstSource(
  project: EestimateProject,
  item: ProjectNode
): string {
  const scopeKey = itemSheetScopeKey(item)
  const saved = project.printStudioDocuments?.[scopeKey]
  const settings = resolveItemSheetDocumentSettings(project, item)
  const source = saved ?? applyDocumentSettingsToTypst(itemSheetTypstTemplate(project, item), settings)
  return `${EE_ITEM_TABLE_PRELUDE}\n${source}`
}
