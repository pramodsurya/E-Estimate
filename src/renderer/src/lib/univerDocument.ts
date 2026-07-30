/**
 * Rich page documents, stored as Univer `IDocumentData` in the project file.
 *
 * Pages used to hold a plain `document?: string`. That field is still read so
 * older projects open with their text intact — it becomes the body of the new
 * document on first edit — and is left in place rather than deleted, so a
 * project saved by a newer build still opens in an older one with its text.
 */

import {
  BooleanNumber,
  DrawingTypeEnum,
  HorizontalAlign,
  ImageSourceType,
  ObjectRelativeFromH,
  ObjectRelativeFromV,
  PositionedObjectLayoutType,
  WrapTextType,
  type IDocumentData,
  type IParagraph,
  type IParagraphStyle,
  type ITextRun,
  type ITextStyle
} from '@univerjs/core'
import emblemTelanganaPng from '../assets/emblem-telangana.png?inline'
import type { ProjectMeta, ProjectNode } from '../types/project'
import { formatCompactIndianEstimate } from './estimateAmount'
import { newId } from './tree'

/** Roughly A4 at 96dpi, in Univer's pixel units. */
const PAGE_WIDTH = 794
const PAGE_HEIGHT = 1123
const MARGIN = 72
const FRONT_COVER_COST_DRAWING_PREFIX = 'estimated_cost_'
const FRONT_COVER_COST_DESCRIPTION = 'E-Estimate Dashboard cost widget'
const FRONT_COVER_COST_WIDTH = 430
const FRONT_COVER_COST_HEIGHT = 120
const FRONT_COVER_COST_LEFT = (PAGE_WIDTH - FRONT_COVER_COST_WIDTH) / 2
const FRONT_COVER_COST_TOP = 390
type FrontCoverDrawing = NonNullable<IDocumentData['drawings']>[string] & {
  imageSourceType: ImageSourceType
  source: string
}

/** Keep the emblem inside the project snapshot so saved covers remain portable. */
function telanganaEmblemDataUrl(): string {
  return emblemTelanganaPng
}

function estimatedCostImageDataUrl(value: number | null): string {
  const amount =
    typeof value === 'number' && Number.isFinite(value)
      ? formatCompactIndianEstimate(value)
      : '__________________'

  // Univer reliably renders and exports raster image drawings. Generate the
  // cost card as a real PNG in the renderer instead of depending on SVG image
  // decoding inside its canvas drawing layer.
  if (typeof document !== 'undefined') {
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = FRONT_COVER_COST_WIDTH * scale
    canvas.height = FRONT_COVER_COST_HEIGHT * scale
    const context = canvas.getContext('2d')
    if (context) {
      context.scale(scale, scale)
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, FRONT_COVER_COST_WIDTH, FRONT_COVER_COST_HEIGHT)

      if (value === null) {
        context.strokeStyle = '#98A2B3'
        context.lineWidth = 1.5
        context.setLineDash([7, 5])
        context.strokeRect(2, 2, FRONT_COVER_COST_WIDTH - 4, FRONT_COVER_COST_HEIGHT - 4)
        context.setLineDash([])
      }

      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillStyle = '#667085'
      context.font = '700 16px Aptos, Arial, sans-serif'
      context.fillText('ESTIMATED COST', FRONT_COVER_COST_WIDTH / 2, 31)

      context.fillStyle = '#6D1F2F'
      context.font = '700 31px Cambria, Georgia, serif'
      context.fillText(`₹ ${amount}`, FRONT_COVER_COST_WIDTH / 2, 79)
      return canvas.toDataURL('image/png')
    }
  }

  // Non-browser callers retain a portable fallback. Runtime-created cover
  // widgets always take the PNG path above.
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="430" height="120" viewBox="0 0 430 120">',
    '<rect width="430" height="120" fill="#ffffff"/>',
    '<text x="215" y="34" text-anchor="middle" font-family="Aptos,Arial,sans-serif" font-size="16" font-weight="700" fill="#667085">ESTIMATED COST</text>',
    `<text x="215" y="87" text-anchor="middle" font-family="Cambria,Georgia,serif" font-size="31" font-weight="700" fill="#6D1F2F">&#8377; ${amount}</text>`,
    '</svg>'
  ].join('')
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

function estimatedCostDrawing(
  documentId: string,
  drawingId: string,
  value: number | null
): FrontCoverDrawing {
  return {
    unitId: documentId,
    subUnitId: documentId,
    drawingId,
    drawingType: DrawingTypeEnum.DRAWING_IMAGE,
    imageSourceType: ImageSourceType.BASE64,
    source: estimatedCostImageDataUrl(value),
    transform: {
      left: FRONT_COVER_COST_LEFT,
      top: FRONT_COVER_COST_TOP,
      width: FRONT_COVER_COST_WIDTH,
      height: FRONT_COVER_COST_HEIGHT,
      angle: 0
    },
    docTransform: {
      size: { width: FRONT_COVER_COST_WIDTH, height: FRONT_COVER_COST_HEIGHT },
      positionH: { relativeFrom: ObjectRelativeFromH.PAGE, posOffset: FRONT_COVER_COST_LEFT },
      positionV: { relativeFrom: ObjectRelativeFromV.PAGE, posOffset: FRONT_COVER_COST_TOP },
      angle: 0
    },
    behindDoc: BooleanNumber.FALSE,
    title: 'Estimated cost',
    description: FRONT_COVER_COST_DESCRIPTION,
    layoutType: PositionedObjectLayoutType.WRAP_NONE,
    wrapText: WrapTextType.BOTH_SIDES,
    allowTransform: true,
    distB: 0,
    distL: 0,
    distR: 0,
    distT: 0
  } as FrontCoverDrawing
}

interface CoverParagraph {
  text: string
  textStyle?: ITextStyle
  paragraphStyle?: IParagraphStyle
}

export interface FrontCoverLocation {
  village?: string | null
  mandal?: string | null
  district?: string | null
}

/** Build a fully editable rich-document cover from the project metadata. */
export function createFrontCoverDocumentData(
  node: ProjectNode,
  meta: ProjectMeta,
  tableLocation?: FrontCoverLocation
): IDocumentData {
  const projectName = meta.name.trim() || node.name || 'Name of Project'
  const village =
    tableLocation?.village?.trim() || meta.areaAllowance?.village?.trim() || '________________'
  const mandal =
    tableLocation?.mandal?.trim() || meta.areaAllowance?.mandal?.trim() || '________________'
  const district =
    tableLocation?.district?.trim() || meta.areaAllowance?.district?.trim() || '________________'
  const estimatedCost =
    typeof meta.estimatedCost === 'number' && Number.isFinite(meta.estimatedCost)
      ? meta.estimatedCost
      : null
  const centre: IParagraphStyle = {
    horizontalAlign: HorizontalAlign.CENTER,
    lineSpacing: 1.15
  }
  const governmentStyle: IParagraphStyle = {
    ...centre,
    spaceBelow: { v: 30 }
  }
  const workStyle: IParagraphStyle = {
    ...centre,
    lineSpacing: 1.4,
    spaceBelow: { v: 18 },
    shading: { backgroundColor: { rgb: '#F7FBF8' } }
  }
  const locationStyle: IParagraphStyle = {
    ...centre,
    lineSpacing: 1.25,
    spaceBelow: { v: 36 }
  }
  const identifierStyle: IParagraphStyle = {
    horizontalAlign: HorizontalAlign.LEFT,
    lineSpacing: 1.25,
    spaceBelow: { v: 7 },
    indentStart: { v: 36 },
    indentEnd: { v: 36 }
  }
  const footerStyle: IParagraphStyle = {
    ...centre,
    spaceAbove: { v: 170 }
  }

  const coverParagraphs: CoverParagraph[] = [
    {
      text: 'GOVERNMENT OF TELANGANA',
      textStyle: {
        ff: 'Cambria',
        fs: 18,
        bl: BooleanNumber.TRUE,
        cl: { rgb: '#076B3D' }
      },
      paragraphStyle: governmentStyle
    },
    {
      text: 'NAME OF WORK',
      textStyle: { ff: 'Aptos', fs: 10, bl: BooleanNumber.TRUE, cl: { rgb: '#6D1F2F' } },
      paragraphStyle: { ...centre, spaceBelow: { v: 8 } }
    },
    {
      text: projectName,
      textStyle: { ff: 'Cambria', fs: 21, bl: BooleanNumber.TRUE, cl: { rgb: '#172B23' } },
      paragraphStyle: workStyle
    },
    {
      text: `${village} (V)  •  ${mandal} (M)  •  ${district} (D)`,
      textStyle: { ff: 'Aptos', fs: 12, bl: BooleanNumber.TRUE, cl: { rgb: '#344054' } },
      paragraphStyle: locationStyle
    },
    {
      // The cost itself is a floating drawing. This paragraph reserves its
      // initial vertical band without tying the drawing to that position.
      text: '',
      paragraphStyle: { ...centre, spaceAbove: { v: 120 }, spaceBelow: { v: 18 } }
    },
    {
      text: 'GeoID :  ______________________________',
      textStyle: { ff: 'Aptos', fs: 11, bl: BooleanNumber.TRUE, cl: { rgb: '#344054' } },
      paragraphStyle: identifierStyle
    },
    {
      text: 'UID    :  ______________________________',
      textStyle: { ff: 'Aptos', fs: 11, bl: BooleanNumber.TRUE, cl: { rgb: '#344054' } },
      paragraphStyle: identifierStyle
    },
    {
      text: 'SUB-DIVISION NO. :  ____________________      DIVISION :  ____________________',
      textStyle: { ff: 'Aptos', fs: 10, bl: BooleanNumber.TRUE, cl: { rgb: '#344054' } },
      paragraphStyle: footerStyle
    }
  ]

  const documentId = `doc_${node.id}`
  const logoId = `telangana_emblem_${node.id}`
  const costId = `${FRONT_COVER_COST_DRAWING_PREFIX}${node.id}`
  let dataStream = '\b\b\r'
  const textRuns: ITextRun[] = []
  const paragraphs: IParagraph[] = [{ startIndex: 2, paragraphStyle: centre }]

  for (const paragraph of coverParagraphs) {
    const start = dataStream.length
    dataStream += paragraph.text
    if (paragraph.text && paragraph.textStyle) {
      textRuns.push({ st: start, ed: dataStream.length, ts: paragraph.textStyle })
    }
    const breakIndex = dataStream.length
    dataStream += '\r'
    paragraphs.push({
      startIndex: breakIndex,
      ...(paragraph.paragraphStyle ? { paragraphStyle: paragraph.paragraphStyle } : {})
    })
  }
  dataStream += '\n'

  const logoWidth = 152
  const logoHeight = 152
  const logoLeft = (PAGE_WIDTH - logoWidth) / 2
  const logo = {
    unitId: documentId,
    subUnitId: documentId,
    drawingId: logoId,
    drawingType: DrawingTypeEnum.DRAWING_IMAGE,
    imageSourceType: ImageSourceType.BASE64,
    source: telanganaEmblemDataUrl(),
    transform: { left: logoLeft, top: 48, width: logoWidth, height: logoHeight, angle: 0 },
    docTransform: {
      size: { width: logoWidth, height: logoHeight },
      positionH: { relativeFrom: ObjectRelativeFromH.PAGE, posOffset: logoLeft },
      positionV: { relativeFrom: ObjectRelativeFromV.PARAGRAPH, posOffset: 0 },
      angle: 0
    },
    behindDoc: BooleanNumber.FALSE,
    title: 'Telangana emblem',
    description: 'Select this emblem to resize, replace, or remove it.',
    layoutType: PositionedObjectLayoutType.INLINE,
    wrapText: WrapTextType.BOTH_SIDES,
    distB: 0,
    distL: 0,
    distR: 0,
    distT: 0
  }
  const cost = estimatedCostDrawing(documentId, costId, estimatedCost)

  return {
    id: documentId,
    body: {
      dataStream,
      textRuns,
      paragraphs,
      customBlocks: [
        { startIndex: 0, blockId: logoId },
        { startIndex: 1, blockId: costId }
      ],
      sectionBreaks: [{ startIndex: dataStream.length - 1 }]
    },
    documentStyle: {
      pageSize: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
      marginTop: 48,
      marginBottom: 54,
      marginRight: MARGIN,
      marginLeft: MARGIN
    },
    drawings: { [logoId]: logo, [costId]: cost },
    drawingsOrder: [logoId, costId]
  } as IDocumentData
}

function clearLegacyEstimatedCost(
  body: NonNullable<IDocumentData['body']>
): NonNullable<IDocumentData['body']> {
  const labelStart = body.dataStream.indexOf('ESTIMATED COST')
  if (labelStart < 0) return body
  const labelBreak = body.dataStream.indexOf('\r', labelStart)
  const amountStart = labelBreak + 1
  const amountBreak = body.dataStream.indexOf('\r', amountStart)
  if (labelBreak < 0 || amountBreak < 0) return body

  const previousAmount = body.dataStream.slice(amountStart, amountBreak)
  if (!/(?:₹|Crores|Lakhs|Thousand|_{3,})/i.test(previousAmount)) return body

  const chars = body.dataStream.split('')
  for (let index = labelStart; index < labelBreak; index += 1) chars[index] = ' '
  for (let index = amountStart; index < amountBreak; index += 1) chars[index] = ' '

  const paragraphs = body.paragraphs?.map((paragraph) => {
    if (paragraph.startIndex !== labelBreak && paragraph.startIndex !== amountBreak) return paragraph
    const style = paragraph.paragraphStyle
    if (!style) return paragraph
    const { shading: _shading, ...paragraphStyle } = style
    return { ...paragraph, paragraphStyle }
  })

  return { ...body, dataStream: chars.join(''), paragraphs }
}

function appendDrawingAnchor(
  body: NonNullable<IDocumentData['body']>,
  drawingId: string
): NonNullable<IDocumentData['body']> {
  if (body.customBlocks?.some((block) => block.blockId === drawingId)) return body

  const insertAt = body.dataStream.endsWith('\n')
    ? body.dataStream.length - 1
    : body.dataStream.length
  const shift = (index: number): number => (index >= insertAt ? index + 1 : index)

  return {
    ...body,
    dataStream: `${body.dataStream.slice(0, insertAt)}\b${body.dataStream.slice(insertAt)}`,
    textRuns: body.textRuns?.map((run) => ({
      ...run,
      st: shift(run.st),
      ed: run.ed > insertAt ? run.ed + 1 : run.ed
    })),
    paragraphs: body.paragraphs?.map((paragraph) => ({
      ...paragraph,
      startIndex: shift(paragraph.startIndex)
    })),
    customBlocks: [
      ...(body.customBlocks?.map((block) => ({
        ...block,
        startIndex: shift(block.startIndex)
      })) ?? []),
      { startIndex: insertAt, blockId: drawingId }
    ],
    sectionBreaks: body.sectionBreaks?.map((sectionBreak) => ({
      ...sectionBreak,
      startIndex: shift(sectionBreak.startIndex)
    }))
  }
}

function setFrontCoverEstimatedCost(
  node: ProjectNode,
  estimatedCost: number | null,
  replaceExistingSource: boolean
): IDocumentData {
  const existing: IDocumentData = isUniverDocumentData(node.documentData)
    ? node.documentData
    : ({
        id: `doc_${node.id}`,
        body: bodyFromPlainText(node.document ?? ''),
        documentStyle: {
          pageSize: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          marginTop: MARGIN,
          marginBottom: MARGIN,
          marginRight: MARGIN,
          marginLeft: MARGIN
        },
        drawings: {},
        drawingsOrder: []
      } as IDocumentData)
  const drawings = existing.drawings ?? {}
  const storedCost = Object.entries(drawings).find(
    ([drawingId, drawing]) =>
      drawingId === `${FRONT_COVER_COST_DRAWING_PREFIX}${node.id}` ||
      drawing.description === FRONT_COVER_COST_DESCRIPTION
  )
  const drawingId = storedCost?.[0] ?? `${FRONT_COVER_COST_DRAWING_PREFIX}${node.id}`
  const replacement = estimatedCostDrawing(existing.id, drawingId, estimatedCost)
  const drawing: FrontCoverDrawing = storedCost
    ? ({
        ...storedCost[1],
        ...(replaceExistingSource
          ? {
              drawingType: replacement.drawingType,
              imageSourceType: replacement.imageSourceType,
              source: replacement.source
            }
          : {}),
        title: replacement.title,
        description: replacement.description,
        allowTransform: true
      } as FrontCoverDrawing)
    : replacement
  // A stored document can carry no body at all; anchor the drawing to an empty
  // one rather than losing the cost figure.
  const body = appendDrawingAnchor(
    clearLegacyEstimatedCost(existing.body ?? bodyFromPlainText('')),
    drawingId
  )

  return {
    ...existing,
    body,
    drawings: { ...drawings, [drawingId]: drawing },
    drawingsOrder: existing.drawingsOrder?.includes(drawingId)
      ? existing.drawingsOrder
      : [...(existing.drawingsOrder ?? []), drawingId]
  } as IDocumentData
}

/** True when the Front Page already contains an anchored, visible cost object. */
export function frontCoverHasEstimatedCost(node: ProjectNode): boolean {
  const documentData = node.documentData
  if (!isUniverDocumentData(documentData)) return false
  const storedCost = Object.entries(documentData.drawings ?? {}).find(
    ([drawingId, drawing]) =>
      drawingId === `${FRONT_COVER_COST_DRAWING_PREFIX}${node.id}` ||
      drawing.description === FRONT_COVER_COST_DESCRIPTION
  )
  const storedSource = (storedCost?.[1] as Partial<FrontCoverDrawing> | undefined)?.source
  return Boolean(
    storedCost &&
      typeof storedSource === 'string' &&
      storedSource.startsWith('data:image/png') &&
      documentData.body?.customBlocks?.some((block) => block.blockId === storedCost[0])
  )
}

/** Resolve the stable cost drawing id, including ids saved by earlier builds. */
export function frontCoverEstimatedCostDrawingId(
  node: ProjectNode,
  documentData: IDocumentData | undefined = node.documentData
): string {
  const storedCost = Object.entries(documentData?.drawings ?? {}).find(
    ([drawingId, drawing]) =>
      drawingId === `${FRONT_COVER_COST_DRAWING_PREFIX}${node.id}` ||
      drawing.description === FRONT_COVER_COST_DESCRIPTION
  )
  return storedCost?.[0] ?? `${FRONT_COVER_COST_DRAWING_PREFIX}${node.id}`
}

/**
 * Add an empty movable Estimated Cost object without requiring a Dashboard sync.
 * If a saved cost drawing only lost its anchor, restore it without changing its value.
 */
export function addFrontCoverEstimatedCost(
  node: ProjectNode,
  estimatedCost: number | null = null
): IDocumentData {
  const value = typeof estimatedCost === 'number' && Number.isFinite(estimatedCost)
    ? estimatedCost
    : null
  return setFrontCoverEstimatedCost(node, value, true)
}

/**
 * Refresh only the movable Estimated Cost object on a stored Front Page.
 * Every other paragraph, drawing, style, and user-selected transform is retained.
 */
export function updateFrontCoverEstimatedCost(
  node: ProjectNode,
  estimatedCost: number
): IDocumentData {
  if (!Number.isFinite(estimatedCost)) throw new Error('Dashboard estimated cost is unavailable.')
  return setFrontCoverEstimatedCost(node, estimatedCost, true)
}

export function isUniverDocumentData(value: unknown): value is IDocumentData {
  if (!value || typeof value !== 'object') return false
  const maybe = value as Partial<IDocumentData>
  return typeof maybe.id === 'string' && typeof maybe.body === 'object' && maybe.body !== null
}

/** True only when a legacy snapshot has no visible text or embedded drawing. */
export function isUniverDocumentBlank(data: IDocumentData | undefined): boolean {
  if (!data) return true
  const visibleText = (data.body?.dataStream ?? '').replace(/[\b\r\n]/g, '').trim()
  const hasDrawing = Object.keys(data.drawings ?? {}).length > 0
  return !visibleText && !hasDrawing
}

/**
 * Older generated covers used paragraph borders as decorative rules. Univer can
 * paint those borders through the text baseline, so Front Page rendering drops
 * only those four border properties and preserves every other user edit.
 */
function withoutFrontCoverParagraphBorders(data: IDocumentData): IDocumentData {
  let changed = false
  const paragraphs = data.body?.paragraphs?.map((paragraph) => {
    const style = paragraph.paragraphStyle
    if (!style || (!style.borderTop && !style.borderBottom && !style.borderLeft && !style.borderRight)) {
      return paragraph
    }
    changed = true
    const {
      borderTop: _borderTop,
      borderBottom: _borderBottom,
      borderLeft: _borderLeft,
      borderRight: _borderRight,
      ...paragraphStyle
    } = style
    return { ...paragraph, paragraphStyle }
  })
  return changed && data.body
    ? { ...data, body: { ...data.body, paragraphs } }
    : data
}

/**
 * Univer stores paragraph breaks as \r and section breaks as \n, and every
 * paragraph needs a matching entry in `paragraphs` at the index of its break.
 */
function bodyFromPlainText(text: string): NonNullable<IDocumentData['body']> {
  const paragraphs = text.length ? text.split(/\r\n|\r|\n/) : ['']
  const dataStream = `${paragraphs.join('\r')}\r\n`

  const breaks: Array<{ startIndex: number }> = []
  let cursor = 0
  for (const paragraph of paragraphs) {
    cursor += paragraph.length
    breaks.push({ startIndex: cursor })
    cursor += 1 // the \r itself
  }

  return {
    dataStream,
    textRuns: [],
    paragraphs: breaks,
    sectionBreaks: [{ startIndex: dataStream.length - 1 }]
  }
}

export function createUniverDocumentData(
  node: ProjectNode,
  meta?: ProjectMeta,
  tableLocation?: FrontCoverLocation
): IDocumentData {
  const existing = isUniverDocumentData(node.documentData) ? node.documentData : undefined
  const isUninitializedBlankCover =
    node.pageTemplate === 'front' &&
    !node.frontCoverInitialized &&
    !node.document?.trim() &&
    isUniverDocumentBlank(existing)

  if (isUninitializedBlankCover && meta) {
    return createFrontCoverDocumentData(node, meta, tableLocation)
  }

  if (existing) {
    return node.pageTemplate === 'front'
      ? withoutFrontCoverParagraphBorders(existing)
      : existing
  }

  return {
    id: `doc_${node.id}`,
    body: bodyFromPlainText(node.document ?? ''),
    documentStyle: {
      pageSize: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
      marginTop: MARGIN,
      marginBottom: MARGIN,
      marginRight: MARGIN,
      marginLeft: MARGIN
    },
    // Present even when empty: the drawing plugin reads these on the Front Page.
    drawings: {},
    drawingsOrder: []
  }
}

/** A blank document, used when a Front Page is first created. */
export function emptyUniverDocumentData(): IDocumentData {
  return {
    id: `doc_${newId()}`,
    body: bodyFromPlainText(''),
    documentStyle: {
      pageSize: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
      marginTop: MARGIN,
      marginBottom: MARGIN,
      marginRight: MARGIN,
      marginLeft: MARGIN
    },
    // Present even when empty: the drawing plugin reads these on the Front Page.
    drawings: {},
    drawingsOrder: []
  }
}

/** Plain-text projection of a document, for search and legacy consumers. */
export function documentPlainText(data: IDocumentData | undefined): string {
  const stream = data?.body?.dataStream ?? ''
  return stream.replace(/\r\n$/, '').replace(/\r/g, '\n')
}

/** Univer marks an empty run with BooleanNumber.FALSE; re-exported for callers. */
export const DOCUMENT_FALSE = BooleanNumber.FALSE
