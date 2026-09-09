/**
 * Translates Univer `IDocumentData` to a structured Typst document representation.
 *
 * Univer stores document content as a continuous `dataStream` (\r ends each paragraph,
 * \n ends each section, \b denotes inline custom blocks/drawings), styled by `textRuns`
 * and structured by `paragraphs`.
 *
 * This module converts those structures into a clean JSON layout that Typst
 * templates (`univerDoc.typ` / `itemdoc.typ`) consume natively.
 */

import { PRESET_LIST_TYPE } from '@univerjs/core'
import type { IDocumentData, IListData, INestingLevel } from '@univerjs/core'
import type { DocumentFinalNumber, DocumentPrintArea, ProjectNode } from '../../types/project'
import { paragraphInPrintArea, resolvePrintArea } from '../documentFinal'
import { emblemSource, isEmblemSource } from '../emblem'
import type { ExtractedMedia, ItemMediaItem } from './itemTypst'

// 1 px at 96 DPI is 0.75 pt (72 / 96)
const PX_TO_PT = 0.75

export interface TypstDocInlineImage {
  id: string
  path: string
  widthPt: number
  heightPt: number
}

export interface TypstDocTextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  sizePt?: number
  fontFamily?: string
  colorHex?: string
  backgroundHex?: string
  overline?: boolean
  baseline?: 'subscript' | 'superscript'
  letterSpacingPt?: number
  linkUrl?: string
  tab?: boolean
  tabWidthPt?: number
  inlineImage?: TypstDocInlineImage
}

export interface TypstDocParagraph {
  align: 'left' | 'center' | 'right' | 'justify'
  spaceAbovePt?: number
  spaceBelowPt?: number
  lineSpacing?: number
  indentStartPt?: number
  indentEndPt?: number
  firstLineIndentPt?: number
  hangingPt?: number
  listMarker?: string
  justify?: boolean
  keepTogether?: boolean
  keepWithNext?: boolean
  isBlank?: boolean
  pageBreakBefore?: boolean
  backgroundHex?: string
  table?: TypstDocTable
  runs: TypstDocTextRun[]
}

export interface TypstDocTableCell {
  text: string
  colSpan: number
  rowSpan: number
  backgroundHex?: string
}

export interface TypstDocTable {
  columnsPt: number[]
  rows: Array<{ cells: TypstDocTableCell[] }>
  align: 'left' | 'center' | 'right'
}

export interface TypstDocFloatingImage {
  id: string
  path: string
  leftPt: number
  topPt: number
  widthPt: number
  heightPt: number
}

export interface TypstDocData {
  paragraphs: TypstDocParagraph[]
  floatingImages: TypstDocFloatingImage[]
}

/** Univer marks a style as enabled with 1 or true. */
function isOn(value: unknown): boolean {
  return value === 1 || value === true
}

interface TextStyleLike {
  bl?: unknown
  it?: unknown
  ul?: { s?: unknown } | unknown
  st?: { s?: unknown } | unknown
  fs?: number
  ff?: string
  cl?: { rgb?: string }
  bg?: { rgb?: string }
  ol?: { s?: unknown } | unknown
  va?: unknown
  sa?: number
}

interface ParsedStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  sizePt?: number
  fontFamily?: string
  colorHex?: string
  backgroundHex?: string
  overline?: boolean
  baseline?: 'subscript' | 'superscript'
  letterSpacingPt?: number
  linkUrl?: string
}

function parseTextStyle(ts: TextStyleLike | undefined): ParsedStyle {
  if (!ts) return {}
  const res: ParsedStyle = {}
  if (ts.bl !== undefined) res.bold = isOn(ts.bl)
  if (ts.it !== undefined) res.italic = isOn(ts.it)
  const ul = ts.ul as { s?: unknown } | undefined
  if (ts.ul !== undefined) res.underline = isOn(ul?.s) || isOn(ts.ul)
  const st = ts.st as { s?: unknown } | undefined
  if (ts.st !== undefined) res.strike = isOn(st?.s) || isOn(ts.st)
  const ol = ts.ol as { s?: unknown } | undefined
  if (ts.ol !== undefined) res.overline = isOn(ol?.s) || isOn(ts.ol)
  if (typeof ts.fs === 'number' && ts.fs > 0) res.sizePt = ts.fs
  if (typeof ts.ff === 'string' && ts.ff) res.fontFamily = ts.ff
  const rgb = ts.cl?.rgb
  if (typeof rgb === 'string' && rgb.startsWith('#')) res.colorHex = rgb
  const background = ts.bg?.rgb
  if (typeof background === 'string' && background.startsWith('#')) res.backgroundHex = background
  if (ts.va === 2) res.baseline = 'subscript'
  else if (ts.va === 3) res.baseline = 'superscript'
  if (typeof ts.sa === 'number' && Number.isFinite(ts.sa)) res.letterSpacingPt = ts.sa * PX_TO_PT
  return res
}

function mergeStyles(...styles: ParsedStyle[]): ParsedStyle {
  return Object.assign({}, ...styles)
}

function stylesMatch(a: ParsedStyle, b: ParsedStyle): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strike === b.strike &&
    a.sizePt === b.sizePt &&
    a.fontFamily === b.fontFamily &&
    a.colorHex === b.colorHex &&
    a.backgroundHex === b.backgroundHex &&
    a.overline === b.overline &&
    a.baseline === b.baseline &&
    a.letterSpacingPt === b.letterSpacingPt &&
    a.linkUrl === b.linkUrl
  )
}

function alignmentFromUniver(value: unknown): 'left' | 'center' | 'right' | 'justify' {
  if (value === 2) return 'center'
  if (value === 3) return 'right'
  if (value === 4 || value === 5) return 'justify'
  return 'left'
}

function numberUnitPt(value: unknown): number | undefined {
  const amount = (value as { v?: unknown } | undefined)?.v
  return typeof amount === 'number' && Number.isFinite(amount) ? amount * PX_TO_PT : undefined
}

function alphaNumber(value: number, upper: boolean): string {
  let n = Math.max(1, value)
  let result = ''
  while (n > 0) {
    n -= 1
    result = String.fromCharCode((upper ? 65 : 97) + (n % 26)) + result
    n = Math.floor(n / 26)
  }
  return result
}

function romanNumber(value: number, upper: boolean): string {
  const numerals: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ]
  let n = Math.max(1, value)
  let result = ''
  for (const [amount, glyph] of numerals) {
    while (n >= amount) {
      result += glyph
      n -= amount
    }
  }
  return upper ? result : result.toLowerCase()
}

function listNumber(value: number, glyphType: unknown): string {
  if (glyphType === 4) return alphaNumber(value, true)
  if (glyphType === 5) return alphaNumber(value, false)
  if (glyphType === 6) return romanNumber(value, true)
  if (glyphType === 7) return romanNumber(value, false)
  if (glyphType === 3) return String(value).padStart(2, '0')
  return String(value)
}

function parseTableText(segment: string): string[][] {
  const rows: string[][] = []
  let row: string[] | null = null
  let cell: string | null = null
  for (const char of segment) {
    if (char === '\x1b') {
      row = []
    } else if (char === '\x1c') {
      cell = ''
    } else if (char === '\x1d') {
      if (row && cell !== null) row.push(cell.replace(/\r/g, '\n').replace(/\n+$/, ''))
      cell = null
    } else if (char === '\x1e') {
      if (row) rows.push(row)
      row = null
    } else if (cell !== null && char !== '\x1a' && char !== '\x1f') {
      cell += char
    }
  }
  return rows
}

type UniverTableRange = NonNullable<NonNullable<IDocumentData['body']>['tables']>[number]

function convertTable(data: IDocumentData, tableRange: UniverTableRange): TypstDocTable | null {
  const table = data.tableSource?.[tableRange.tableId]
  const stream = data.body?.dataStream ?? ''
  if (!table || tableRange.endIndex <= tableRange.startIndex) return null
  const textRows = parseTableText(stream.slice(tableRange.startIndex, tableRange.endIndex + 1))
  const columnsPt = table.tableColumns.map((column) => numberUnitPt(column.size?.width) ?? 72)
  const rows = table.tableRows.map((row, rowIndex) => ({
    cells: row.tableCells.map((cell, cellIndex) => ({
      text: textRows[rowIndex]?.[cellIndex] ?? '',
      colSpan: Math.max(1, Number(cell.columnSpan) || 1),
      rowSpan: Math.max(1, Number(cell.rowSpan) || 1),
      backgroundHex: cell.backgroundColor?.rgb ?? undefined
    }))
  }))
  return {
    columnsPt,
    rows,
    align: table.align === 1 ? 'center' : table.align === 2 ? 'right' : 'left'
  }
}

interface DrawingLike {
  source?: unknown
  title?: unknown
  description?: unknown
  drawingType?: unknown
  layoutType?: unknown
  transform?: { left?: unknown; top?: unknown; width?: unknown; height?: unknown }
  docTransform?: {
    size?: { width?: unknown; height?: unknown }
    positionH?: { posOffset?: unknown }
    positionV?: { posOffset?: unknown }
  }
}

function resolveImageSource(source: string): string {
  if (source.startsWith('data:')) return source
  return isEmblemSource(source) ? emblemSource() : source
}

function sanitizeBase64(raw: string): string {
  const comma = raw.indexOf(',')
  return comma >= 0 ? raw.slice(comma + 1) : raw
}

/** Extract drawings and images from a document item into shadow files & gallery items. */
export function extractDocumentMedia(item: ProjectNode): ExtractedMedia {
  const drawings = (item.documentData?.drawings ?? {}) as Record<string, DrawingLike>
  const shadowFiles: Record<string, string> = {}
  const images: ItemMediaItem[] = []
  const gallery: ItemMediaItem[] = []

  let index = 0
  for (const [id, drawing] of Object.entries(drawings)) {
    if (!drawing || typeof drawing.source !== 'string' || !drawing.source.trim()) continue
    const resolvedSrc = resolveImageSource(drawing.source)
    const base64Data = sanitizeBase64(resolvedSrc)
    if (!base64Data) continue

    const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '_')
    const shadowPath = `images/doc_img_${cleanId}.png`
    shadowFiles[shadowPath] = base64Data

    const rawW = drawing.docTransform?.size?.width ?? drawing.transform?.width
    const rawH = drawing.docTransform?.size?.height ?? drawing.transform?.height
    const width = typeof rawW === 'number' ? Math.max(1, Math.min(rawW, 1600)) : 180
    const height = typeof rawH === 'number' ? Math.max(1, Math.min(rawH, 1600)) : 210

    const rawLeft = drawing.docTransform?.positionH?.posOffset ?? drawing.transform?.left
    const rawTop = drawing.docTransform?.positionV?.posOffset ?? drawing.transform?.top
    const left = typeof rawLeft === 'number' ? rawLeft : 0
    const top = typeof rawTop === 'number' ? rawTop : 0

    const name =
      typeof drawing.title === 'string' && drawing.title.trim()
        ? drawing.title
        : typeof drawing.description === 'string' && drawing.description.trim()
          ? drawing.description
          : `Document Image ${index + 1}`

    const isFloating = drawing.layoutType !== undefined && drawing.layoutType !== 0
    const typstSnippet = isFloating
      ? `#place(top + left, dx: ${(left * PX_TO_PT).toFixed(1)}pt, dy: ${(top * PX_TO_PT).toFixed(1)}pt, image("${shadowPath}", width: ${(width * PX_TO_PT).toFixed(1)}pt, height: ${(height * PX_TO_PT).toFixed(1)}pt))`
      : `#image("${shadowPath}", width: ${(width * PX_TO_PT).toFixed(1)}pt, height: ${(height * PX_TO_PT).toFixed(1)}pt)`

    const mediaItem: ItemMediaItem = {
      id: cleanId,
      name,
      path: shadowPath,
      left,
      top,
      relLeftPx: left,
      relTopPx: top,
      width,
      height,
      type: 'drawing',
      typstSnippet,
      previewUrl: resolvedSrc.startsWith('data:') ? resolvedSrc : undefined
    }

    images.push(mediaItem)
    gallery.push(mediaItem)
    index += 1
  }

  return { shadowFiles, images, gallery }
}

/** Parses `IDocumentData` into structured Typst paragraphs, runs, and image blocks. */
export function parseDocumentToTypstData(
  data: IDocumentData | undefined,
  printArea?: DocumentPrintArea,
  finalNumber?: DocumentFinalNumber | null
): TypstDocData {
  if (!data || !data.body) {
    return { paragraphs: [], floatingImages: [] }
  }

  const area = resolvePrintArea(data, printArea, finalNumber)
  const body = data.body
  const stream = body.dataStream ?? ''
  if (!stream.trim()) {
    return { paragraphs: [], floatingImages: [] }
  }

  // Univer persists only custom lists in `data.lists`. Built-in list presets
  // (BULLET_LIST, ORDER_LIST, ORDER_LIST_QUICK_*, CHECK_LIST, …) live in
  // `PRESET_LIST_TYPE`. Merge them so a paragraph that points at a preset
  // still resolves to a concrete list definition. The document's own custom
  // lists win if they happen to shadow a preset key.
  const documentLists = (data.lists ?? {}) as Record<string, IListData>
  const lists: Record<string, IListData> = { ...PRESET_LIST_TYPE, ...documentLists }

  // Pre-calculate character style array
  const runs = [...(body.textRuns ?? [])].sort((a, b) => a.st - b.st)
  const stylesAt = new Array<ParsedStyle>(stream.length)
  for (let i = 0; i < stream.length; i += 1) stylesAt[i] = {}

  for (const run of runs) {
    const style = parseTextStyle(run.ts as TextStyleLike | undefined)
    for (let i = Math.max(0, run.st); i < Math.min(stream.length, run.ed); i += 1) {
      stylesAt[i] = mergeStyles(stylesAt[i], style)
    }
  }
  for (const range of body.customRanges ?? []) {
    const url = (range.properties as { url?: unknown } | undefined)?.url
    if (range.rangeType !== 0 || typeof url !== 'string' || !url.trim()) continue
    for (let i = Math.max(0, range.startIndex); i < Math.min(stream.length, range.endIndex); i += 1) {
      stylesAt[i] = mergeStyles(stylesAt[i], { linkUrl: url })
    }
  }

  // Paragraph metadata by break index
  const paragraphMap = new Map<number, NonNullable<typeof body.paragraphs>[number]>()
  for (const p of body.paragraphs ?? []) {
    paragraphMap.set(p.startIndex, p)
  }
  const tableRanges = new Map<number, UniverTableRange>()
  for (const table of body.tables ?? []) tableRanges.set(table.startIndex, table)

  // Drawings lookup
  const drawings = (data.drawings ?? {}) as Record<string, DrawingLike>
  const customBlockMap = new Map<number, string>()
  for (const block of body.customBlocks ?? []) {
    customBlockMap.set(block.startIndex, block.blockId)
  }

  const floatingImages: TypstDocFloatingImage[] = []
  const processedFloatingIds = new Set<string>()

  // Detect floating drawings
  for (const [id, drawing] of Object.entries(drawings)) {
    if (!drawing || typeof drawing.source !== 'string') continue
    const isFloating = drawing.layoutType !== undefined && drawing.layoutType !== 0
    if (!isFloating) continue

    const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '_')
    processedFloatingIds.add(id)

    const rawW = drawing.docTransform?.size?.width ?? drawing.transform?.width
    const rawH = drawing.docTransform?.size?.height ?? drawing.transform?.height
    const width = typeof rawW === 'number' ? Math.max(1, Math.min(rawW, 1600)) : 180
    const height = typeof rawH === 'number' ? Math.max(1, Math.min(rawH, 1600)) : 210

    const rawLeft = drawing.docTransform?.positionH?.posOffset ?? drawing.transform?.left
    const rawTop = drawing.docTransform?.positionV?.posOffset ?? drawing.transform?.top
    const left = typeof rawLeft === 'number' ? rawLeft : 0
    const top = typeof rawTop === 'number' ? rawTop : 0

    floatingImages.push({
      id: cleanId,
      path: `images/doc_img_${cleanId}.png`,
      leftPt: left * PX_TO_PT,
      topPt: top * PX_TO_PT,
      widthPt: width * PX_TO_PT,
      heightPt: height * PX_TO_PT
    })
  }

  const resultParagraphs: TypstDocParagraph[] = []
  let currentRuns: TypstDocTextRun[] = []
  let pendingText = ''
  let pendingStyle: ParsedStyle = {}
  let paragraphIndex = 0
  const listCounters = new Map<string, number>()
  const documentTextStyle = parseTextStyle(data.documentStyle?.textStyle as TextStyleLike | undefined)
  let pageBreakBefore = false

  const flushTextRun = (): void => {
    if (!pendingText) return
    currentRuns.push({
      text: pendingText,
      ...pendingStyle
    })
    pendingText = ''
    pendingStyle = {}
  }

  const flushParagraph = (breakIndex: number): void => {
    flushTextRun()

    const pMeta = paragraphMap.get(breakIndex) ?? body.paragraphs?.[paragraphIndex]
    const bullet = pMeta?.bullet
    const nestingLevel = Math.max(0, Number(bullet?.nestingLevel) || 0)
    const list = bullet ? lists[bullet.listType] : undefined
    const level: INestingLevel | undefined = list?.nestingLevel?.[nestingLevel]
    const pStyle = { ...(level?.paragraphProperties ?? {}), ...(pMeta?.paragraphStyle ?? {}) }
    const paragraphTextStyle = parseTextStyle(pStyle.textStyle as TextStyleLike | undefined)
    const align = alignmentFromUniver(pStyle?.horizontalAlign)
    const spaceAbovePt = numberUnitPt(pStyle?.spaceAbove)
    const spaceBelowPt = numberUnitPt(pStyle?.spaceBelow)
    const lineSpacing = typeof pStyle?.lineSpacing === 'number' ? pStyle.lineSpacing : undefined
    let listMarker: string | undefined
    if (bullet && level) {
      // Univer encodes bullet glyphs as `glyphSymbol` on the nesting level.
      // Preset bullet lists deliberately omit `glyphType`; treat that as a
      // bullet (ListGlyphType.BULLET === 0) as well.
      const isBullet = level.glyphType === 0 || (level.glyphType === undefined && !!level.glyphSymbol)
      if (isBullet) {
        listMarker = (level.glyphSymbol || '•').trim()
      } else if (level.glyphType !== 1) {
        const listKey = bullet.listId || bullet.listType || 'default'
        const counterKey = `${listKey}:${nestingLevel}`
        const value = (listCounters.get(counterKey) ?? (Number(level.startNumber) || 1) - 1) + 1
        listCounters.set(counterKey, value)
        const format = level.glyphFormat || `%${nestingLevel + 1}.`
        listMarker = format.replace(/%(\d+)/g, (_match, rawLevel: string) => {
          const referencedLevel = Math.max(0, Number(rawLevel) - 1)
          const referenced = list?.nestingLevel?.[referencedLevel]
          const referencedValue = referencedLevel === nestingLevel
            ? value
            : listCounters.get(`${listKey}:${referencedLevel}`) ?? referenced?.startNumber ?? 1
          return listNumber(referencedValue, referenced?.glyphType)
        }).trim()
      }
    }

    if (paragraphInPrintArea(paragraphIndex, area)) {
      const paragraphRuns = currentRuns.length > 0 ? currentRuns : [{ text: '' }]
      resultParagraphs.push({
        align,
        spaceAbovePt,
        spaceBelowPt,
        lineSpacing,
        indentStartPt: numberUnitPt(pStyle?.indentStart),
        indentEndPt: numberUnitPt(pStyle?.indentEnd),
        firstLineIndentPt: numberUnitPt(pStyle?.indentFirstLine),
        hangingPt: numberUnitPt(pStyle?.hanging),
        listMarker,
        justify: align === 'justify',
        keepTogether: isOn(pStyle?.keepLines),
        keepWithNext: isOn(pStyle?.keepNext),
        isBlank: paragraphRuns.every((run) => !run.text && !run.inlineImage && !run.tab),
        pageBreakBefore,
        backgroundHex: pStyle?.shading?.backgroundColor?.rgb ?? undefined,
        runs: paragraphRuns.map((run) => ({
          ...run,
          ...mergeStyles(documentTextStyle, paragraphTextStyle, run)
        }))
      })
    }

    pageBreakBefore = false
    paragraphIndex += 1
    currentRuns = []
  }

  for (let index = 0; index < stream.length; index += 1) {
    const char = stream[index]

    const tableRange = tableRanges.get(index)
    if (tableRange) {
      flushTextRun()
      const table = convertTable(data, tableRange)
      if (table && paragraphInPrintArea(paragraphIndex, area)) {
        resultParagraphs.push({
          align: table.align,
          table,
          runs: [],
          pageBreakBefore
        })
      }
      pageBreakBefore = false
      index = Math.max(index, tableRange.endIndex)
      continue
    }

    if (char === '\r') {
      flushParagraph(index)
      continue
    }

    if (char === '\n') {
      // Section breaks in Univer do not emit text
      const section = body.sectionBreaks?.find((entry) => entry.startIndex === index)
      if (section && typeof section.sectionType === 'number' && section.sectionType >= 2) {
        pageBreakBefore = true
      }
      continue
    }

    if (char === '\f') {
      flushTextRun()
      pageBreakBefore = true
      continue
    }

    if (char === '\t') {
      flushTextRun()
      const defaultTab = typeof data.documentStyle?.defaultTabStop === 'number'
        ? data.documentStyle.defaultTabStop * PX_TO_PT
        : 36
      currentRuns.push({ text: '', tab: true, tabWidthPt: defaultTab })
      continue
    }

    if (char === '\b') {
      // Inline drawing marker
      flushTextRun()
      const blockId = customBlockMap.get(index)
      if (blockId) {
        const drawing = drawings[blockId]
        if (drawing && !processedFloatingIds.has(blockId)) {
          const cleanId = blockId.replace(/[^a-zA-Z0-9_-]/g, '_')
          const rawW = drawing.docTransform?.size?.width ?? drawing.transform?.width
          const rawH = drawing.docTransform?.size?.height ?? drawing.transform?.height
          const width = typeof rawW === 'number' ? Math.max(1, Math.min(rawW, 1600)) : 180
          const height = typeof rawH === 'number' ? Math.max(1, Math.min(rawH, 1600)) : 210

          currentRuns.push({
            text: '',
            inlineImage: {
              id: cleanId,
              path: `images/doc_img_${cleanId}.png`,
              widthPt: width * PX_TO_PT,
              heightPt: height * PX_TO_PT
            }
          })
        }
      }
      continue
    }

    // Structural table delimiters are represented by the table block above,
    // never as visible text when an older/incomplete snapshot lacks metadata.
    if (char >= '\x1a' && char <= '\x1f') continue

    const style = stylesAt[index] || {}
    if (pendingText.length > 0 && !stylesMatch(pendingStyle, style)) {
      flushTextRun()
    }

    pendingStyle = style
    pendingText += char
  }

  if (pendingText.length > 0 || currentRuns.length > 0) {
    flushParagraph(stream.length)
  }

  return {
    paragraphs: resultParagraphs,
    floatingImages
  }
}
