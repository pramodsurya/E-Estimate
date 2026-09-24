import type { EestimateProject, ProjectNode } from '../../types/project'
import type { DetailGrid } from './detailGrid'
import { resolveNodeSettingsOverrides } from '../nodeSettings'
import {
  normalizeDocumentSettings,
  parseDocumentSettingsFromTypst,
  resolveProjectDocumentSettings,
  type DocumentSettings
} from '../typist-output/documentSettings'

export interface ExcelPrintSettings {
  pageSize: DocumentSettings['pageSize']
  orientation: DocumentSettings['orientation']
  marginsMm: DocumentSettings['margins']
  fontName: string
  fontSizePt: number
}

const EXCEL_FONTS: Record<DocumentSettings['fontFamily'], string> = {
  times: 'Times New Roman',
  sans: 'Calibri',
  arial: 'Arial',
  georgia: 'Georgia',
  'source-sans': 'Source Sans 3',
  'source-serif': 'Source Serif 4'
}

/** Project defaults → inherited node settings → Print Studio settings → saved Typst. */
export function resolveExcelDocumentSettings(
  project: EestimateProject,
  scopeKey?: string,
  node?: ProjectNode,
  fallback?: Partial<DocumentSettings>
): DocumentSettings {
  const projectSettings = resolveProjectDocumentSettings(project.projectPrintSettings)
  const inherited = normalizeDocumentSettings(fallback ?? {}, projectSettings)
  const overrides = node ? resolveNodeSettingsOverrides(project.root, node.id) : {}
  const withNode = normalizeDocumentSettings({
    pageSize: overrides.pageSize,
    orientation: overrides.orientation,
    margins: overrides.margins,
    fontSizePt: inherited.fontSizePt * (overrides.reportFontPercent ?? 100) / 100
  }, inherited)
  if (!scopeKey) return withNode
  const saved = normalizeDocumentSettings(project.printStudioDocumentSettings?.[scopeKey] ?? {}, withNode)
  const source = project.printStudioDocuments?.[scopeKey]
  return source ? parseDocumentSettingsFromTypst(source, saved) : saved
}

export function excelPrintSettings(settings: DocumentSettings): ExcelPrintSettings {
  return {
    pageSize: settings.pageSize,
    orientation: settings.orientation,
    marginsMm: settings.margins,
    fontName: EXCEL_FONTS[settings.fontFamily],
    fontSizePt: settings.fontSizePt
  }
}

/** Change only app-generated report typography; preserve user-authored grid styles. */
export function applyGeneratedExcelFont(grid: DetailGrid, settings: ExcelPrintSettings): void {
  const scale = settings.fontSizePt / 11
  for (const cell of grid.cells) {
    cell.style = {
      ...cell.style,
      fontName: settings.fontName,
      sizePt: Math.max(6, Math.min(72, (cell.style?.sizePt ?? 11) * scale))
    }
  }
}
