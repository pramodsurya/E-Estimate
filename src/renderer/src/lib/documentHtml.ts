/**
 * Renders a Univer `IDocumentData` to HTML for the print view and PDF export.
 *
 * Univer stores the text as one `dataStream` with \r ending each paragraph and
 * \n ending each section, plus `textRuns` carrying character styling over index
 * ranges. This walks the runs in order and emits one styled span per run.
 */

import type { IDocumentData } from '@univerjs/core'
import { emblemSource, isEmblemSource } from './emblem'
import type { DocumentPrintArea } from '../types/project'
import { paragraphInPrintArea, resolvePrintArea } from './documentFinal'

/** Point a cover that stored the emblem as an asset path at the embedded copy. */
function printableImageSource(source: string): string {
  if (source.startsWith('data:')) return source
  return isEmblemSource(source) ? emblemSource() : source
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Univer marks a style as on with BooleanNumber.TRUE (1). */
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
}

function styleToCss(style: TextStyleLike | undefined): string {
  if (!style) return ''
  const parts: string[] = []
  if (isOn(style.bl)) parts.push('font-weight:700')
  if (isOn(style.it)) parts.push('font-style:italic')

  const decorations: string[] = []
  const underline = style.ul as { s?: unknown } | undefined
  const strike = style.st as { s?: unknown } | undefined
  if (isOn(underline?.s) || isOn(style.ul)) decorations.push('underline')
  if (isOn(strike?.s) || isOn(style.st)) decorations.push('line-through')
  if (decorations.length) parts.push(`text-decoration:${decorations.join(' ')}`)

  if (typeof style.fs === 'number' && style.fs > 0) parts.push(`font-size:${style.fs}pt`)
  if (typeof style.ff === 'string' && style.ff) parts.push(`font-family:${style.ff}`)
  const colour = style.cl?.rgb
  if (typeof colour === 'string' && colour) parts.push(`color:${colour}`)

  return parts.join(';')
}

/** Univer horizontal alignment: 1 left, 2 centre, 3 right, 4/5 justified. */
function alignmentToCss(value: unknown): string {
  if (value === 1) return 'left'
  if (value === 2) return 'center'
  if (value === 3) return 'right'
  if (value === 4 || value === 5) return 'justify'
  return ''
}

interface NumberUnitLike {
  v?: unknown
}

interface BorderLike {
  color?: { rgb?: unknown }
  width?: unknown
  dashStyle?: unknown
  padding?: unknown
}

interface ParagraphStyleLike {
  horizontalAlign?: unknown
  lineSpacing?: unknown
  spaceAbove?: NumberUnitLike
  spaceBelow?: NumberUnitLike
  shading?: { backgroundColor?: { rgb?: unknown } }
  borderTop?: BorderLike
  borderBottom?: BorderLike
  borderLeft?: BorderLike
  borderRight?: BorderLike
}

function paragraphStyleToCss(style: ParagraphStyleLike | undefined): string {
  if (!style) return ''
  const parts: string[] = []
  const align = alignmentToCss(style.horizontalAlign)
  if (align) parts.push(`text-align:${align}`)
  if (typeof style.lineSpacing === 'number') parts.push(`line-height:${style.lineSpacing}`)
  if (typeof style.spaceAbove?.v === 'number') parts.push(`margin-top:${style.spaceAbove.v}px`)
  if (typeof style.spaceBelow?.v === 'number') parts.push(`margin-bottom:${style.spaceBelow.v}px`)
  const background = style.shading?.backgroundColor?.rgb
  if (typeof background === 'string' && background) parts.push(`background:${background}`)

  const borders = [
    ['top', style.borderTop],
    ['bottom', style.borderBottom],
    ['left', style.borderLeft],
    ['right', style.borderRight]
  ] as const
  let padding = 0
  for (const [side, border] of borders) {
    if (!border) continue
    const width = typeof border.width === 'number' ? border.width : 1
    const colour = typeof border.color?.rgb === 'string' ? border.color.rgb : '#D0D5DD'
    const dash = border.dashStyle === 2 ? 'dotted' : border.dashStyle === 3 ? 'dashed' : 'solid'
    parts.push(`border-${side}:${width}px ${dash} ${colour}`)
    if (typeof border.padding === 'number') padding = Math.max(padding, border.padding)
  }
  if (padding) parts.push(`padding:${padding}px`)
  return parts.join(';')
}

interface Segment {
  text: string
  css: string
  html?: string
}

export function documentToHtml(
  data: IDocumentData | undefined,
  /** Restricts output to a paragraph span; omitted means the whole document. */
  printArea?: DocumentPrintArea
): string {
  const area = resolvePrintArea(data, printArea)
  const body = data?.body
  const stream = body?.dataStream ?? ''
  if (!stream.trim()) return ''

  // Character styling, indexed so a lookup per character stays cheap.
  const runs = [...(body?.textRuns ?? [])].sort((a, b) => a.st - b.st)
  const cssAt = new Array<string>(stream.length).fill('')
  for (const run of runs) {
    const css = styleToCss(run.ts as TextStyleLike | undefined)
    if (!css) continue
    for (let index = Math.max(0, run.st); index < Math.min(stream.length, run.ed); index += 1) {
      cssAt[index] = css
    }
  }

  const paragraphStyleAt = new Map<number, unknown>()
  for (const paragraph of body?.paragraphs ?? []) {
    paragraphStyleAt.set(paragraph.startIndex, paragraph.paragraphStyle)
  }

  const drawingHtmlAt = new Map<number, string>()
  const floatingDrawingHtml: string[] = []
  const drawings = (data?.drawings ?? {}) as Record<
    string,
    {
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
  >
  for (const block of body?.customBlocks ?? []) {
    const drawing = drawings[block.blockId]
    if (!drawing || typeof drawing.source !== 'string') continue
    const rawWidth = drawing.docTransform?.size?.width
    const rawHeight = drawing.docTransform?.size?.height
    const width = typeof rawWidth === 'number' ? Math.max(1, Math.min(rawWidth, 1600)) : 180
    const height = typeof rawHeight === 'number' ? Math.max(1, Math.min(rawHeight, 1600)) : 210
    const alt =
      typeof drawing.title === 'string'
        ? drawing.title
        : typeof drawing.description === 'string'
          ? drawing.description
          : 'Document image'
    if (drawing.layoutType !== undefined && drawing.layoutType !== 0) {
      const rawLeft = drawing.transform?.left ?? drawing.docTransform?.positionH?.posOffset
      const rawTop = drawing.transform?.top ?? drawing.docTransform?.positionV?.posOffset
      const left = typeof rawLeft === 'number' ? Math.max(-1600, Math.min(rawLeft, 3200)) : 0
      const top = typeof rawTop === 'number' ? Math.max(-1600, Math.min(rawTop, 4800)) : 0
      floatingDrawingHtml.push(
        `<div class="document-floating-image" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px"><img src="${escapeHtml(printableImageSource(drawing.source))}" alt="${escapeHtml(alt)}"></div>`
      )
      continue
    }
    drawingHtmlAt.set(
      block.startIndex,
      `<img class="document-inline-image" src="${escapeHtml(printableImageSource(drawing.source))}" alt="${escapeHtml(alt)}" style="width:${width}px;height:${height}px">`
    )
  }

  const html: string[] = []
  let segments: Segment[] = []
  let current: Segment | null = null
  let paragraphIndex = 0

  const flushParagraph = (breakIndex: number): void => {
    if (current) segments.push(current)
    current = null
    const style = paragraphStyleAt.get(breakIndex) as ParagraphStyleLike | undefined
    const paragraphCss = paragraphStyleToCss(style)
    const inner = segments
      .map((segment) => {
        if (segment.html) return segment.html
        return segment.css
          ? `<span style="${segment.css}">${escapeHtml(segment.text)}</span>`
          : escapeHtml(segment.text)
      })
      .join('')
    // An empty paragraph still occupies a line in the document.
    if (paragraphInPrintArea(paragraphIndex, area)) {
      html.push(`<p${paragraphCss ? ` style="${paragraphCss}"` : ''}>${inner || '<br>'}</p>`)
    }
    paragraphIndex += 1
    segments = []
  }

  for (let index = 0; index < stream.length; index += 1) {
    const char = stream[index]
    if (char === '\r') {
      flushParagraph(index)
      continue
    }
    // Section breaks carry no visible text of their own.
    if (char === '\n') continue
    // Drawing custom blocks use a backspace marker in Univer's text stream.
    if (char === '\b') {
      if (current) segments.push(current)
      current = null
      const drawingHtml = drawingHtmlAt.get(index)
      if (drawingHtml) segments.push({ text: '', css: '', html: drawingHtml })
      continue
    }

    const css = cssAt[index]
    if (current && current.css === css) current.text += char
    else {
      if (current) segments.push(current)
      current = { text: char, css }
    }
  }
  if (current || segments.length) flushParagraph(stream.length)

  return `${html.join('')}${floatingDrawingHtml.join('')}`
}

/** True when the document has no visible text. */
export function isDocumentEmpty(data: IDocumentData | undefined): boolean {
  const hasText = Boolean((data?.body?.dataStream ?? '').replace(/[\b\r\n]/g, '').trim())
  const hasDrawing = Object.values(data?.drawings ?? {}).some(
    (drawing) => typeof (drawing as { source?: unknown }).source === 'string'
  )
  return !hasText && !hasDrawing
}
