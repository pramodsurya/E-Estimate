import type { Margins, Orientation, PaperSize } from '../../types/project'
import type { ProjectPrintSettings } from '../projectPrintSettings'

export type DocumentFontFamily =
  | 'times'
  | 'sans'
  | 'arial'
  | 'georgia'
  | 'source-sans'
  | 'source-serif'
type LegacyDocumentFontSize = 'small' | 'normal' | 'large'

export interface DocumentSettings {
  pageSize: PaperSize
  orientation: Orientation
  margins: Margins
  fontFamily: DocumentFontFamily
  /** Base size for ordinary body text. The rest of the hierarchy scales from it. */
  fontSizePt: number
}

export const DOCUMENT_MARGIN_PRESETS: Record<'Normal' | 'Narrow' | 'Wide', Margins> = {
  Normal: { top: 20, right: 15, bottom: 20, left: 25 },
  Narrow: { top: 10, right: 10, bottom: 10, left: 10 },
  Wide: { top: 25, right: 25, bottom: 25, left: 30 }
}

export const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings = {
  pageSize: 'A4',
  orientation: 'portrait',
  margins: DOCUMENT_MARGIN_PRESETS.Normal,
  fontFamily: 'times',
  fontSizePt: 11
}

/**
 * The font catalog the "fonts manager" offers. Each entry is a named, always
 * resoluble stack (bundled open-license fonts first, then common system faces).
 * Extend the catalog + {@link FONT_STACKS} together to add more choices.
 */
export const FONT_CATALOG: Array<{ value: DocumentFontFamily; label: string }> = [
  { value: 'times', label: 'Times New Roman (serif)' },
  { value: 'sans', label: 'Calibri / system sans' },
  { value: 'arial', label: 'Arial' },
  { value: 'georgia', label: 'Georgia (serif)' },
  { value: 'source-sans', label: 'Source Sans 3' },
  { value: 'source-serif', label: 'Source Serif 4' }
]

const LEGACY_FONT_POINTS: Record<LegacyDocumentFontSize, number> = {
  small: 90,
  normal: 100,
  large: 112
}

export function clampDocumentFontSize(value: number): number {
  return Math.round(Math.max(6, Math.min(18, Number.isFinite(value) ? value : 9.5)) * 2) / 2
}

export function documentFontScale(fontSizePt: number): number {
  return clampDocumentFontSize(fontSizePt) / DEFAULT_DOCUMENT_SETTINGS.fontSizePt
}

function legacyFontSizePoint(value: LegacyDocumentFontSize | undefined): number | undefined {
  if (!value) return undefined
  return DEFAULT_DOCUMENT_SETTINGS.fontSizePt * LEGACY_FONT_POINTS[value] / 100
}

export function normalizeDocumentSettings(
  settings: Partial<DocumentSettings> & { fontSize?: LegacyDocumentFontSize },
  fallback: Partial<DocumentSettings> = DEFAULT_DOCUMENT_SETTINGS
): DocumentSettings {
  return {
    pageSize: settings.pageSize ?? fallback.pageSize ?? DEFAULT_DOCUMENT_SETTINGS.pageSize,
    orientation: settings.orientation ?? fallback.orientation ?? DEFAULT_DOCUMENT_SETTINGS.orientation,
    margins: {
      ...(fallback.margins ?? DEFAULT_DOCUMENT_SETTINGS.margins),
      ...(settings.margins ?? {})
    },
    fontFamily: settings.fontFamily ?? fallback.fontFamily ?? DEFAULT_DOCUMENT_SETTINGS.fontFamily,
    fontSizePt: clampDocumentFontSize(
      settings.fontSizePt ??
        legacyFontSizePoint(settings.fontSize) ??
        fallback.fontSizePt ??
        DEFAULT_DOCUMENT_SETTINGS.fontSizePt
    )
  }
}

export function resolveProjectDocumentSettings(
  settings?: Partial<ProjectPrintSettings>
): DocumentSettings {
  const fontPercent = settings?.fontPercent ?? 100
  const legacyFontSize = (settings as Partial<ProjectPrintSettings> & { fontSize?: LegacyDocumentFontSize } | undefined)?.fontSize
  return normalizeDocumentSettings({
    pageSize: settings?.pageSize ?? DEFAULT_DOCUMENT_SETTINGS.pageSize,
    orientation: settings?.orientation ?? DEFAULT_DOCUMENT_SETTINGS.orientation,
    margins: { ...DEFAULT_DOCUMENT_SETTINGS.margins, ...(settings?.margins ?? {}) },
    fontFamily: settings?.fontFamily ?? DEFAULT_DOCUMENT_SETTINGS.fontFamily,
    fontSizePt: clampDocumentFontSize(
      settings?.fontSizePt ?? legacyFontSizePoint(legacyFontSize) ??
      DEFAULT_DOCUMENT_SETTINGS.fontSizePt * fontPercent / 100
    )
  })
}

const FONT_STACKS: Record<DocumentFontFamily, string> = {
  times: '("Times New Roman", "Liberation Serif", "Noto Serif")',
  sans: '("Calibri", "Arial", "Liberation Sans", "Helvetica")',
  arial: '("Arial", "Liberation Sans", "Helvetica")',
  georgia: '("Georgia", "Liberation Serif", "Noto Serif")',
  'source-sans': '("Source Sans 3", "Source Sans Pro", "Arial", "Liberation Sans")',
  'source-serif': '("Source Serif 4", "Source Serif Pro", "Times New Roman", "Liberation Serif")'
}

const MANAGED_BEGIN = '// E-Estimate document settings: begin'
const MANAGED_END = '// E-Estimate document settings: end'

function typstPaper(pageSize: PaperSize): string {
  if (pageSize === 'Letter') return 'us-letter'
  if (pageSize === 'Legal') return 'us-legal'
  return pageSize.toLowerCase()
}

export function applyDocumentSettingsToTypst(
  source: string,
  settings: Partial<DocumentSettings>
): string {
  const resolved = normalizeDocumentSettings(settings)
  const bodyPt = clampDocumentFontSize(resolved.fontSizePt)
  // Every derived size is an `em` multiple of the base (`#set text`), so bumping
  // the base rescales the whole document. Absolute pt only ever anchors the base.
  const block = `${MANAGED_BEGIN}\n#set page(\n  paper: "${typstPaper(resolved.pageSize)}",\n  flipped: ${resolved.orientation === 'landscape'},\n  margin: (top: ${resolved.margins.top}mm, right: ${resolved.margins.right}mm, bottom: ${resolved.margins.bottom}mm, left: ${resolved.margins.left}mm)\n)\n#set text(font: ${FONT_STACKS[resolved.fontFamily]}, size: ${bodyPt}pt)\n#show heading.where(level: 1): set text(size: 1.37em)\n#show heading.where(level: 2): set text(size: 1.16em)\n#show heading.where(level: 3): set text(size: 1.05em)\n#let ee-note(body) = text(size: 0.85em, body)\n#let ee-comment(body) = text(size: 0.85em, style: "italic", body)\n${MANAGED_END}`
  const managedPattern = new RegExp(`${MANAGED_BEGIN}[\\s\\S]*?${MANAGED_END}`)
  if (managedPattern.test(source)) {
    return source.replace(managedPattern, block)
  }

  // If there is an existing unmanaged #set page(...) statement, replace it cleanly
  const setPagePattern = /#set\s+page\([^)]*\)/s
  if (setPagePattern.test(source)) {
    return source.replace(setPagePattern, block)
  }

  const eeMatch = source.match(/#let EE[^\n]*\n/)
  if (eeMatch && eeMatch.index !== undefined) {
    const at = eeMatch.index + eeMatch[0].length
    return `${source.slice(0, at)}\n${block}\n${source.slice(at)}`
  }

  return `${block}\n${source}`
}

/**
 * Reverse-parses document layout settings from a Typst script.
 * If the user or AI edited #set page(...) or #set text(...) directly in code,
 * this extracts the live paper, orientation, margins, and font so the
 * Document Setup GUI form accurately mirrors the code without variables.
 */
export function parseDocumentSettingsFromTypst(
  source: string,
  fallback: DocumentSettings = DEFAULT_DOCUMENT_SETTINGS
): DocumentSettings {
  const result: DocumentSettings = {
    ...fallback,
    margins: { ...fallback.margins }
  }

  // If a managed document settings block exists at the top, parse strictly from it
  // so any mid-document page overrides (e.g. Page 2 A3 Landscape) don't pollute the base settings.
  const managedMatch = source.match(new RegExp(`${MANAGED_BEGIN}([\\s\\S]*?)${MANAGED_END}`))
  const targetText = managedMatch ? managedMatch[1] : source

  // 1. Paper size (e.g. paper: "a4", paper: "a3", paper: "legal")
  const paperMatch = targetText.match(/paper:\s*["']([a-zA-Z0-9]+)["']/)
  if (paperMatch) {
    const rawPaper = paperMatch[1].toUpperCase()
    if (rawPaper === 'A4' || rawPaper === 'A3' || rawPaper === 'LEGAL' || rawPaper === 'LETTER') {
      result.pageSize = rawPaper as PaperSize
    }
  }

  // 2. Flipped / Orientation (e.g. flipped: true, flipped: false)
  const flippedMatch = targetText.match(/flipped:\s*(true|false)/)
  if (flippedMatch) {
    result.orientation = flippedMatch[1] === 'true' ? 'landscape' : 'portrait'
  }

  // 3. Margins
  const topMatch = targetText.match(/top:\s*([0-9.]+)\s*mm/)
  const rightMatch = targetText.match(/right:\s*([0-9.]+)\s*mm/)
  const bottomMatch = targetText.match(/bottom:\s*([0-9.]+)\s*mm/)
  const leftMatch = targetText.match(/left:\s*([0-9.]+)\s*mm/)
  if (topMatch) result.margins.top = parseFloat(topMatch[1])
  if (rightMatch) result.margins.right = parseFloat(rightMatch[1])
  if (bottomMatch) result.margins.bottom = parseFloat(bottomMatch[1])
  if (leftMatch) result.margins.left = parseFloat(leftMatch[1])

  // Single margin shorthand: margin: 15mm
  const singleMarginMatch = targetText.match(/margin:\s*([0-9.]+)\s*mm/)
  if (singleMarginMatch && !topMatch) {
    const m = parseFloat(singleMarginMatch[1])
    result.margins = { top: m, right: m, bottom: m, left: m }
  }

  // 4. Font size: e.g. size: 10pt or size: 9.5pt
  const sizeMatch = targetText.match(/size:\s*([0-9.]+)\s*pt/)
  if (sizeMatch) {
    result.fontSizePt = clampDocumentFontSize(parseFloat(sizeMatch[1]))
  }

  // 5. Font family: e.g. font: ("Times...", ...) or font: "Arial"
  const fontMatch = targetText.match(/font:\s*\(?([^)\n]+)\)?/)
  if (fontMatch) {
    const rawFont = fontMatch[1].toLowerCase()
    if (rawFont.includes('times')) result.fontFamily = 'times'
    else if (rawFont.includes('arial')) result.fontFamily = 'arial'
    else if (rawFont.includes('calibri') || rawFont.includes('sans') || rawFont.includes('helvetica')) {
      result.fontFamily = 'sans'
    }
  }

  return result
}
