/**
 * Excel DATA export module.
 * Produces an exact replica of the official Standard Data workbook:
 * Sheet 1: SSR Items (Rate Analysis recipes with Leads, Variants, Addons, Abstract)
 * Sheet 2: SOR Items (If Any)
 * 100% exact Trebuchet MS typography, row heights, 2-row table headers, borders, and print layout.
 *
 * Exclusively powered by native Rust (`rust_xlsxwriter`) for instant speed, minimal memory,
 * and zero RAM bloating even on massive 1000cr projects.
 * No JavaScript fallback — native compilation is the sole engine.
 */
import { calculateDataSheets, type DataSheet } from '../dataSheets'
import type { EestimateProject } from '../../types/project'
import { excelPrintSettings, resolveExcelDocumentSettings } from './excelDocumentSettings'
import { excelSignatureSettings } from './excelSignature'
import { buildRateAnalysisRenderData } from '../typist-output/dataTypst'

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function buildDataExcelPayload(project: EestimateProject, sheets: DataSheet[]) {
  const ssrSheets = sheets.filter((s) => s.recipe.itemSource !== 'SOR')
  const sorSheets = sheets.filter((s) => s.recipe.itemSource === 'SOR')

  return {
    projectName: project.meta.name || 'STANDARD DATA',
    dataSignature: excelSignatureSettings(project, 'dashboard:data'),
    sorYear: project.meta.sorYear || '2026-27',
    sorZone: project.meta.sorZone || 'zone_3',
    recipes: ssrSheets.map((s) => ({
      ...buildRateAnalysisRenderData(s.recipe, s.leadApplications, s.leadVariants, {
        scopeName: s.scopeName,
        usagePath: s.usagePath,
        scope: s.scope
      }, s.calculatedSummary),
      excelKey: s.id
    })),
    sor: sorSheets.map((s, i) => ({
      excelKey: s.id,
      sl: i + 1,
      description: s.recipe.description,
      unit: s.recipe.unit || 'unit',
      rate: s.sorPrintRate?.hasNumericRate ? s.sorPrintRate.finalRate : null,
      baseRate: s.sorPrintRate?.hasNumericRate
        ? s.sorPrintRate.finalRate - s.sorPrintRate.leadRate
        : null,
      outputQty: s.recipe.outputQuantity || 1,
      leadLinks: s.leadApplications.map((application) => ({
        leadKey: application.variantId,
        quantity: application.quantity
      })),
      rateText: s.sorPrintRate?.hasNumericRate
        ? undefined
        : s.sorPrintRate?.rateText || s.recipe.publishedRateText || 'Rate not published'
    }))
  }
}

/**
 * Compiles the project DATA sheets into an Excel workbook using native rust_xlsxwriter.
 * Strictly native with NO JavaScript fallback.
 */
export async function buildDataExcelWorkbook(
  project: EestimateProject,
  sheets: DataSheet[]
): Promise<Uint8Array> {
  if (typeof window === 'undefined' || typeof window.api?.excel?.compile !== 'function') {
    throw new Error(
      'Native Excel compiler (rust_xlsxwriter) is required. Please ensure the desktop app is running.'
    )
  }

  const payload = buildDataExcelPayload(project, await calculateDataSheets(sheets))
  const result = await window.api.excel.compile({
    ...payload,
    printSettings: excelPrintSettings(resolveExcelDocumentSettings(project))
  })

  if (!result || !result.ok || !result.data) {
    throw new Error(
      result?.error || 'Native Excel compilation failed via rust_xlsxwriter.'
    )
  }

  return decodeBase64(result.data)
}
