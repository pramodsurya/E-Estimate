/**
 * Final quantity and print area for document-editor items.
 *
 * A spreadsheet item points at a cell address, which survives editing. A
 * document has no addresses — only character offsets into the text stream — so
 * a stored offset drifts as soon as text above it changes. Both features here
 * are therefore built to notice drift rather than silently read the wrong text:
 *
 *  - the final number keeps the value captured when it was fixed, and falls
 *    back to it (flagging a re-fix) if the range stops parsing as a number;
 *  - the print area is stored as a paragraph span, because paragraphs keep
 *    their identity when text reflows.
 */

import type { IDocumentData } from '@univerjs/core'
import type { DocumentFinalNumber, DocumentPrintArea, ProjectNode } from '../types/project'

/**
 * Parses a number as written in an estimate: thousands separators, currency
 * symbols and trailing units are tolerated, so selecting "1,447.666 CUM" works.
 */
export function parseFixableNumber(text: string | null | undefined): number | null {
  if (!text) return null
  // Matched directly rather than by stripping a prefix: stripping a character
  // class containing '.' silently ate the decimal point, turning .75 into 75.
  // The second alternative is for figures written without a leading zero.
  const match = text.match(/-?(?:\d[\d,]*(?:\.\d+)?|\.\d+)/)
  if (!match) return null
  const value = Number(match[0].replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

export interface DocumentParagraph {
  /** Index into `body.paragraphs`. */
  index: number
  /** Offset where this paragraph's text starts. */
  startIndex: number
  /** Offset of the paragraph break, i.e. the exclusive end of the text. */
  endIndex: number
  text: string
}

/** Splits a document into its paragraphs, with the offsets each one spans. */
export function documentParagraphs(data: IDocumentData | undefined): DocumentParagraph[] {
  const body = data?.body
  const stream = body?.dataStream ?? ''
  const paragraphs: DocumentParagraph[] = []
  let cursor = 0
  for (const [index, paragraph] of (body?.paragraphs ?? []).entries()) {
    const endIndex = paragraph.startIndex
    paragraphs.push({
      index,
      startIndex: cursor,
      endIndex,
      // \b marks an embedded drawing and is not visible text.
      text: stream.slice(cursor, endIndex).replace(/\b/g, '')
    })
    cursor = endIndex + 1
  }
  return paragraphs
}

export interface DocumentFinalResolution {
  /** The quantity to use, or null when none is fixed. */
  value: number | null
  /**
   * True when the stored range no longer holds a number, so `value` is the
   * captured fallback and the estimator should fix it again.
   */
  needsRefix: boolean
  /** Text currently under the stored range, for display. */
  currentText: string | null
}

export function resolveDocumentFinal(node: ProjectNode): DocumentFinalResolution {
  const fixed = node.documentFinal
  if (!fixed) return { value: null, needsRefix: false, currentText: null }

  const stream = node.documentData?.body?.dataStream ?? ''
  // An out-of-bounds range means the document shrank beneath it.
  if (fixed.endIndex > stream.length || fixed.startIndex >= fixed.endIndex) {
    return { value: fixed.capturedValue, needsRefix: true, currentText: null }
  }

  const currentText = stream.slice(fixed.startIndex, fixed.endIndex)
  const live = parseFixableNumber(currentText)
  // Still a number: take it live, so editing the figure updates the estimate.
  if (live !== null) return { value: live, needsRefix: false, currentText }
  // No longer a number: the offsets drifted onto other text.
  return { value: fixed.capturedValue, needsRefix: true, currentText }
}

/** Builds the record stored when the estimator fixes a selection. */
export function createDocumentFinal(
  startIndex: number,
  endIndex: number,
  text: string
): DocumentFinalNumber | null {
  const value = parseFixableNumber(text)
  if (value === null) return null
  return { startIndex, endIndex, capturedValue: value, capturedText: text }
}

/** Clamps a stored print area to the paragraphs that currently exist. */
export function resolvePrintArea(
  data: IDocumentData | undefined,
  area: DocumentPrintArea | undefined
): DocumentPrintArea | null {
  if (!area) return null
  const count = data?.body?.paragraphs?.length ?? 0
  if (count === 0) return null
  const start = Math.max(0, Math.min(area.startParagraph, count - 1))
  const end = Math.max(start, Math.min(area.endParagraph, count - 1))
  return { startParagraph: start, endParagraph: end }
}

/** True when the paragraph at `index` falls inside the print area. */
export function paragraphInPrintArea(
  index: number,
  area: DocumentPrintArea | null | undefined
): boolean {
  if (!area) return true
  return index >= area.startParagraph && index <= area.endParagraph
}
