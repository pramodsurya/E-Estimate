/**
 * Where a subject's closing block actually lands.
 *
 * A document whose own layout plans its pages — the component abstract, the
 * grouped measurement sheets — already knows the signature block is coming and
 * reserves height for it on its closing page (see `pageFlowPlanner.ts`). Those
 * documents need nothing from this file.
 *
 * The template detailed estimates are different. A bund, a guide wall, a sluice
 * emit free-flowing HTML and let Chromium paginate it, so there is no page model
 * to reserve anything in: the signature block is simply appended, and when the
 * sheet the content ends on has no room for it Chromium moves the whole block
 * onto a page of its own. That page carries nothing else — the "signatures on an
 * empty sheet" this module exists to remove.
 *
 * Nothing here estimates a height, because the estimate is exactly what would be
 * wrong. It asks the real print engine instead, and the rule is the same one the
 * page planner uses: the closing block may not cost a sheet.
 *
 *  1. Render the document with no block at all. That page count is how many
 *     sheets the work itself needs, and it is the budget for everything below.
 *  2. Render it with the block in flow. If the document still ends on the same
 *     sheet, the block fitted — take it, and the output is what it always was.
 *  3. Otherwise render it again with the block tightened. Most near misses are
 *     the two centimetres of air above the signature lines, not the lines.
 *  4. If even that will not fit, stop putting the block in the flow. Reserve a
 *     band at the foot of every sheet and draw the signatures into the band on
 *     the closing sheet. The content spreads into the space it is given, so the
 *     last sheet carries real work with the signatures beneath it — which is
 *     both correct and how a signed estimate is meant to read.
 *
 * Because this sits in the render path rather than in any one template, a
 * template added later inherits it by doing nothing.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { SignatureFooterRow, SignatureFooterSettings } from '../types/project'
import type { PdfOptions } from './printRender'
import {
  applySignatureFooterToPdf,
  injectSubjectEndSignature,
  printableSignatureRows,
  type ClosingDensity
} from './signatureFooter'

/** Renders one HTML document to PDF bytes. Injected so this stays testable. */
export type PdfRenderer = (html: string, options: PdfOptions) => Promise<Uint8Array>

export interface ClosingAwareRequest {
  html: string
  options: PdfOptions
  signature: SignatureFooterSettings
  /**
   * The document's own page planner already reserved room for the closing
   * block, so it is applied directly and none of the ladder below runs.
   */
  closingReserved?: boolean
  /**
   * False while a subject continues into a later document — a bund's landscape
   * schedules and portrait narrative are one detailed estimate printed as
   * several requests, and only the last of them signs it off.
   */
  carriesClosing?: boolean
}

const PT_PER_MM = 72 / 25.4
/** Band reserved at the foot of every sheet when the block leaves the flow. */
const CLOSING_BAND_MM = 26
/** Where inside that band the signature rules sit, measured from its floor. */
const RULE_ABOVE_BAND_MM = 20
const SIDE_MARGIN_MM = 10

async function pageCount(bytes: Uint8Array): Promise<number> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
  return pdf.getPageCount()
}

/**
 * Apply the resolved signature settings and render, putting the closing block
 * on a page that carries work rather than on one of its own.
 */
export async function renderSignedPdf(
  request: ClosingAwareRequest,
  render: PdfRenderer
): Promise<Uint8Array> {
  const settings = request.signature
  const rows = printableSignatureRows(settings)
  if (!settings.enabled || rows.length === 0) {
    return render(request.html, request.options)
  }

  // Every-page mode already lives in Chromium's reserved footer margin, so it
  // can never orphan and it belongs on continuation documents too.
  if (settings.placement === 'every_page') {
    const signed = applySignatureFooterToPdf(request.html, request.options, settings)
    return render(signed.html, signed.options)
  }

  if (request.carriesClosing === false) {
    return render(request.html, request.options)
  }
  if (request.closingReserved) {
    const signed = applySignatureFooterToPdf(request.html, request.options, settings)
    return render(signed.html, signed.options)
  }
  return placeClosingBlock(request, rows, render)
}

async function placeClosingBlock(
  request: ClosingAwareRequest,
  rows: SignatureFooterRow[],
  render: PdfRenderer
): Promise<Uint8Array> {
  // What the work itself costs. Anything above this is a sheet the signatures
  // bought, and no arrangement of a signature block is worth a sheet.
  const budget = await pageCount(await render(request.html, request.options))

  const densities: ClosingDensity[] = ['normal', 'compact']
  let inFlow: Uint8Array | null = null
  let inFlowSheets = Number.POSITIVE_INFINITY
  for (const density of densities) {
    const bytes = await render(
      injectSubjectEndSignature(request.html, request.signature, density),
      request.options
    )
    const sheets = await pageCount(bytes)
    if (sheets === budget) return bytes
    if (!inFlow) {
      inFlow = bytes
      inFlowSheets = sheets
    }
  }

  const fallback = async (): Promise<Uint8Array> =>
    inFlow ??
    render(injectSubjectEndSignature(request.html, request.signature), request.options)

  // Drawing goes through the standard PDF fonts, which carry Latin text only.
  // A designation written in another script would come out mangled, and a
  // mangled signature is worse than one on a sheet of its own — so that case
  // keeps the browser-rendered block, which handles any script.
  if (!rows.every(isDrawable)) return fallback()

  // The sheet is genuinely full. Give the block a band of its own instead of a
  // page of its own — and let the content reflow into the space that frees up.
  try {
    const floorMm = request.options.margins.bottom * 25.4
    const reserved: PdfOptions = {
      ...request.options,
      margins: {
        ...request.options.margins,
        bottom: request.options.margins.bottom + CLOSING_BAND_MM / 25.4
      }
    }
    const bytes = await render(request.html, reserved)
    // The band is charged to every sheet, so on a document already full to the
    // margins it can cost more than the orphan did. Fewer sheets always wins.
    if ((await pageCount(bytes)) > inFlowSheets) return fallback()
    return await stampClosingBlock(bytes, rows, floorMm)
  } catch {
    return fallback()
  }
}

function isDrawable(row: SignatureFooterRow): boolean {
  return (
    encodable(row.designation) === row.designation.trim() &&
    encodable(row.office) === row.office.trim()
  )
}

/**
 * WinAnsi is all the standard PDF fonts can encode, and `drawText` throws on
 * anything outside it rather than dropping it. Strip first so a designation
 * typed in another script costs its own glyphs, not the whole export.
 */
function encodable(value: string): string {
  return value.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '').trim()
}

/** Break to at most `maxLines`, on words where possible. */
function wrap(
  text: string,
  width: number,
  maxLines: number,
  measure: (value: string) => number
): string[] {
  if (!text) return []
  const lines: string[] = []
  let current = ''
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word
    if (measure(candidate) <= width || !current) {
      current = candidate
      continue
    }
    lines.push(current)
    current = word
    if (lines.length === maxLines) break
  }
  if (lines.length < maxLines && current) lines.push(current)
  return lines.slice(0, maxLines)
}

/**
 * Draw the signatures into the band reserved at the foot of the closing sheet.
 * `floorMm` is the document's own bottom margin — the band sits directly above
 * it, so the signatures keep the same clearance from the paper edge that the
 * body text does.
 */
async function stampClosingBlock(
  bytes: Uint8Array,
  rows: SignatureFooterRow[],
  floorMm: number
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes)
  const pages = pdf.getPages()
  const page = pages[pages.length - 1]
  if (!page) return bytes

  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const plain = await pdf.embedFont(StandardFonts.Helvetica)
  const { width } = page.getSize()
  const side = SIDE_MARGIN_MM * PT_PER_MM
  const column = (width - side * 2) / rows.length
  const ruleY = (floorMm + RULE_ABOVE_BAND_MM) * PT_PER_MM

  rows.forEach((row, index) => {
    const centre = side + column * index + column / 2
    const rule = column * 0.78
    page.drawLine({
      start: { x: centre - rule / 2, y: ruleY },
      end: { x: centre + rule / 2, y: ruleY },
      thickness: 0.8,
      color: rgb(0.2, 0.2, 0.2)
    })

    const inner = column - 8
    let baseline = ruleY - 11
    for (const line of wrap(encodable(row.designation), inner, 2, (value) =>
      bold.widthOfTextAtSize(value, 9)
    )) {
      page.drawText(line, {
        x: centre - bold.widthOfTextAtSize(line, 9) / 2,
        y: baseline,
        size: 9,
        font: bold,
        color: rgb(0.07, 0.07, 0.07)
      })
      baseline -= 10
    }
    for (const line of wrap(encodable(row.office), inner, 1, (value) =>
      plain.widthOfTextAtSize(value, 8)
    )) {
      page.drawText(line, {
        x: centre - plain.widthOfTextAtSize(line, 8) / 2,
        y: baseline,
        size: 8,
        font: plain,
        color: rgb(0.33, 0.33, 0.33)
      })
    }
  })

  return pdf.save()
}
