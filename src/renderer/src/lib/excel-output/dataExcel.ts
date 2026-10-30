import { attachSsrExcelPlan } from './ssrExcelPlan'
import { individualItemsOutput } from '../individualItemsOutput'
import { collectMorthAppendices } from '../morthAppendices'
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
import {
  excelPrintSettings,
  resolveExcelDocumentSettings
} from './excelDocumentSettings'
import { excelSignatureSettings } from './excelSignature'
import {
  buildRateAnalysisRenderData,
  buildMorthAppendixRenderData
} from '../typist-output/dataTypst'

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function buildDataExcelPayload(
  project: EestimateProject,
  sheets: DataSheet[]
) {
  const ssrSheets = sheets.filter(
    (s) => s.recipe.itemSource !== 'SOR' && s.recipe.itemSource !== 'MORTH'
  )
  const appendices = collectMorthAppendices(sheets.map((s) => s.recipe))
  const sorSheets = sheets.filter((s) => s.recipe.itemSource === 'SOR')

  const resources = individualItemsOutput(sheets.map((sheet) => sheet.recipe))
  const link = (
    recipe: DataSheet['recipe'],
    rendered: ReturnType<typeof buildRateAnalysisRenderData>
  ) => {
    for (const section of recipe.sections)
      for (const [index, line] of section.lines.entries()) {
        const output = rendered[section.key][index]
        if (output && resources.lineKeys.has(line) && output.appendix_key)
          Object.assign(output, {
            appendix_key: undefined,
            appendix_name: undefined
          })
        if (output)
          Object.assign(output, {
            individual_key: resources.lineKeys.get(line),
            amount_fixed:
              line.editedFields?.includes('amount') &&
              !line.editedFields?.some(
                (field) => field === 'rate' || field === 'quantity'
              ),
            group_id: line.groupId
          })
      }
    const addition = recipe.dataVariant?.additionAnalysis
    const extraLines =
      addition?.sections.flatMap((section) =>
        section.lines.map((line) => ({
          description: line.description,
          unit: line.unit,
          quantity: line.quantity,
          rate: line.rate,
          amount: line.amount,
          individual_key: resources.lineKeys.get(line),
          kind: section.key
        }))
      ) ?? []
    return {
      ...(recipe.morth ? rendered : attachSsrExcelPlan(recipe, rendered)),
      section_rules: recipe.sectionRules ?? [],
      live_addition: extraLines,
      live_addition_output: addition?.outputQuantity,
      live_addition_allowance: recipe.areaAllowancePercent ?? 0,
      live_addition_overhead:
        addition?.overheadPercent ?? recipe.overheadPercent,
      live_multiplier: recipe.dataVariant?.postRate
        ? (recipe.dataVariant.postRateMultiplier ??
          1 + (recipe.dataVariant.addPercent ?? 0) / 100)
        : undefined,
      live_steps: recipe.dataVariant?.postRate
        ? recipe.dataVariant.postRateSteps
        : undefined,
      live_step_percent: recipe.dataVariant?.postRateStepPercent
    }
  }
  const appendixPayload = buildMorthAppendixRenderData(
    sheets.map((sheet) => sheet.recipe),
    appendices
  )
  appendixPayload.forEach((rendered, index) =>
    link(appendices[index].recipe, rendered)
  )
  return {
    individualItems: resources.rows,
    sheetPrintSettings: {
      'Individual Items': {
        ...excelPrintSettings(
          resolveExcelDocumentSettings(project, 'individual-items')
        ),
        orientation:
          project.printStudioDocumentSettings?.['individual-items']
            ?.orientation ?? 'landscape'
      }
    },
    projectName: project.meta.name || 'STANDARD DATA',
    dataSignature: excelSignatureSettings(project, 'dashboard:data'),
    sorYear: project.meta.sorYear || '2026-27',
    sorZone: project.meta.sorZone || 'zone_3',
    recipes: ssrSheets.map((s) => ({
      ...link(
        s.recipe,
        buildRateAnalysisRenderData(
          s.recipe,
          s.leadApplications,
          s.leadVariants,
          {
            scopeName: s.scopeName,
            usagePath: s.usagePath,
            scope: s.scope
          },
          s.calculatedSummary
        )
      ),
      excelKey: s.id
    })),
    morthAppendices: appendixPayload,
    morth: sheets
      .filter((s) => s.recipe.itemSource === 'MORTH')
      .map((s) => ({
        ...link(
          s.recipe,
          buildRateAnalysisRenderData(
            s.recipe,
            s.leadApplications,
            s.leadVariants,
            { scopeName: s.scopeName, usagePath: s.usagePath, scope: s.scope },
            s.calculatedSummary,
            appendices
          )
        ),
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
        : s.sorPrintRate?.rateText ||
          s.recipe.publishedRateText ||
          'Rate not published'
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
  if (
    typeof window === 'undefined' ||
    typeof window.api?.excel?.compile !== 'function'
  ) {
    throw new Error(
      'Native Excel compiler (rust_xlsxwriter) is required. Please ensure the desktop app is running.'
    )
  }

  const payload = buildDataExcelPayload(
    project,
    await calculateDataSheets(sheets)
  )
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
