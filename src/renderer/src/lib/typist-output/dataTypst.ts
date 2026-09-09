import defaultTemplate from './data.typ?raw'
/** DATA and rate-analysis data adapter. The complete layout is in data.typ. */

import type { DataSheet } from '../dataSheets'
import type {
  RateAnalysisLine,
  RateAnalysisRecipe,
  RateAnalysisTextRun
} from '../../types/rateAnalysis'
import type { EestimateProject, LeadApplication, LeadVariant, PaperSize, SignatureFooterSettings } from '../../types/project'
import { descriptionRunsForDisplay } from '../rateAnalysisVisibility'
import { buildDataPresentation } from '../dataPresentation'
import { applyDocumentSettingsToTypst, resolveProjectDocumentSettings } from './documentSettings'
import { DATA_SIGNATURE_SCOPE, printableSignatureRows, resolveSignatureFooter } from '../signatureFooter'

/** Escapes special Typst markup characters in text strings. */
export function escapeTypst(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/#/g, '\\#')
    .replace(/\$/g, '\\$')
    .replace(/"/g, '\\"')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/@/g, '\\@')
}

export function fmtMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

export function fmtQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3
  })
}

function printableRuns(text: string, runs?: RateAnalysisTextRun[]): RateAnalysisTextRun[] {
  return descriptionRunsForDisplay(text, runs).filter((run) => run.text.length > 0)
}

function editedMap(line: RateAnalysisLine): Record<string, boolean> {
  const fields = new Set(line.editedFields ?? [])
  return Object.fromEntries(
    ['sl_no', 'description', 'unit', 'quantity', 'rate', 'amount'].map((field) => [field, fields.has(field as never)])
  )
}

function isDisposalLead(variant: LeadVariant | undefined): boolean {
  return variant?.materialName.trim().toLowerCase() === 'disposal lead'
}

function leadDeductionLabel(application: LeadApplication, disposal: boolean): string {
  const label = application.calculation?.rows.find((row) => row.amount < 0)?.label ?? ''
  const km = label.match(/initial\s+([0-9.]+)\s*km/i)
  const prefix = disposal ? 'Disposal lead rate' : 'Rate of Lead'
  if (km) return `${prefix} after removing ${km[1]} km of Initial Lead`
  if (/all leads/i.test(label)) return `${prefix} after removing all included Initial Lead`
  return `${prefix} after removing included Initial Lead`
}

function leadWarnings(application: LeadApplication, variant: LeadVariant | undefined) {
  const warnings: Array<{ message: string; detail: string }> = []
  const delivery = application.deliveryAtSiteWarning || (
    variant && !/^fabricated\s+parts?$/i.test(variant.materialName.trim()) &&
    (variant.conveyanceClass === 'CEMENT' || variant.conveyanceClass === 'STEEL') && variant.leadKm > 0.15
      ? 'Cement/steel basic rate is normally delivery at site. External lead may duplicate transport already included in the material rate.' : ''
  )
  if (delivery) warnings.push({ message: delivery, detail: application.deliveryAtSiteOverrideReason ? `Reason: ${application.deliveryAtSiteOverrideReason}` : 'No override reason recorded' })
  const handling = application.handlingWarning || (
    variant && variant.handlingMode !== 'none' && (application.loadingRate > 0 || application.unloadingRate > 0)
      ? 'Loading/unloading is added from the Lead variant. Use only when it is separately admissible and not already covered in the parent DATA item.' : ''
  )
  if (handling) warnings.push({ message: handling, detail: application.handlingOverrideReason ? `Reason: ${application.handlingOverrideReason}` : 'No override reason recorded' })
  return warnings
}


/** Prepare values only; all document layout lives in data.typ. */
export function buildRateAnalysisRenderData(
  recipe: RateAnalysisRecipe, leadApplications: LeadApplication[] = [], leadVariants: LeadVariant[] = []
) {
  const code = recipe.itemCode?.trim() || recipe.itemKey || 'DATA'
  const unit = recipe.unit || 'cum'
  const outputQty = recipe.outputQuantity || 1
  const desc = recipe.description || ''
  const sectionHeading = recipe.sectionHeading || ''
  const documentTitle = recipe.documentTitle || ''

  // This is the same semantic result consumed by the React DATA view.
  const presentation = buildDataPresentation(recipe, leadApplications, leadVariants)
  const calculated = presentation.summary

  const materialsSection = recipe.sections.find((s) => s.key === 'materials')
  const labourSection = recipe.sections.find((s) => s.key === 'labour')
  const machinerySection = recipe.sections.find((s) => s.key === 'machinery')

  const matLines = materialsSection?.lines ?? []
  const labLines = labourSection?.lines ?? []
  const machLines = machinerySection?.lines ?? []

  const matTotal =
    calculated?.sectionTotals.materials ??
    matLines.reduce((sum, line) => sum + (line.amount || 0), 0)
  const labTotal =
    calculated?.sectionTotals.labour ??
    labLines.reduce((sum, line) => sum + (line.amount || 0), 0)
  const machTotal =
    calculated?.sectionTotals.machinery ??
    machLines.reduce((sum, line) => sum + (line.amount || 0), 0)

  const baseCost = calculated?.baseCost ?? matTotal + labTotal + machTotal
  const overheadPct = recipe.overheadPercent ?? 14
  const overheadAmt = calculated?.overheadAmount ?? (baseCost * overheadPct) / 100
  const areaAllowancePct = recipe.areaAllowancePercent ?? 0
  const areaAllowanceAmt = calculated?.areaAllowanceAmount ?? (labTotal * areaAllowancePct) / 100

  // Labour component unit rate breakdown
  const labUnitBase = outputQty > 0 ? (labTotal + areaAllowanceAmt) / outputQty : 0
  const labUnitProfit = (labUnitBase * overheadPct) / 100
  const labUnitTotal = labUnitBase + labUnitProfit

  // Total lead additions
  const leadTotalAmount = leadApplications.reduce((sum, app) => sum + app.grossAmount, 0)

  // External project Lead is presented after the DATA abstract, exactly as in React.
  const totalCost = calculated?.totalCost ?? baseCost + overheadAmt + areaAllowanceAmt
  const ratePerUnit = outputQty > 0 ? totalCost / outputQty : totalCost
  const baseFinalAmount = presentation.adoptedSummary.totalCost + presentation.addonLeadTotal
  const layout = presentation.layout
  const calculatedAddon = presentation.calculatedAddon
  const addonLeadApplications = presentation.addonLeadApplications
  const regularLeadApplications = presentation.regularLeadApplications
  const rows = (lines: RateAnalysisLine[]) => lines.map((line) => ({
    sl: line.slNo || '', description: line.description, unit: line.unit,
    quantity: line.quantity, rate: line.rate, amount: line.amount,
    qty_text: fmtQty(line.quantity), rate_text: fmtMoney(line.rate), amount_text: fmtMoney(line.amount),
    user_added: Boolean(line.userAdded), edited: editedMap(line),
    source: { rate: line.rateSource ?? '', resource_code: line.resourceCode ?? '', amount: line.amountSource ?? '' }
  }))

  const leadRows = (applications: LeadApplication[]) => applications.map((app) => {
    const variant = leadVariants.find((candidate) => candidate.id === app.variantId)
    const disposal = isDisposalLead(variant)
    return {
      material: disposal ? 'Disposal Lead' : variant?.materialName || app.itemCode || 'Material',
      distance_km: variant?.leadKm ?? null, lift_m: variant?.liftM ?? 0,
      quantity: app.quantity, quantity_source: app.quantitySource || '', quantity_edited: Boolean(app.quantityManuallyEdited),
      unit: app.unit, rate: app.grossRate, amount: app.grossAmount,
      qty_text: fmtQty(app.quantity), rate_text: fmtMoney(app.grossRate), amount_text: fmtMoney(app.grossAmount),
      deduction: app.calculation?.deductedLeadRate ? {
        label: leadDeductionLabel(app, disposal), full_rate_text: fmtMoney(app.calculation.fullLeadRate),
        deducted_rate_text: fmtMoney(app.calculation.deductedLeadRate), net_rate_text: fmtMoney(app.calculation.netLeadRate),
        unit: app.calculation.unit || app.unit,
        rows: app.calculation.rows.map((row) => ({ label: row.label, expression: row.expression, amount_text: fmtMoney(row.amount) }))
      } : null,
      warnings: leadWarnings(app, variant)
    }
  })

  const optionalAnalysis = recipe.dataVariant?.additionAnalysis
  const addonLeadRate = addonLeadApplications.reduce((sum, app) => {
    const divisor = app.outputQuantity || outputQty || 1
    const rate = app.rateAddition ?? app.grossAmount / divisor
    return sum + (Number.isFinite(rate) ? rate : 0)
  }, 0)
  const addonBasisQty = optionalAnalysis?.outputQuantity || outputQty
  const addonLeadCost = addonLeadRate * addonBasisQty
  const addonCostBeforeLead = calculatedAddon?.totalCost ?? optionalAnalysis?.totalCost ?? 0
  const optionalAddition = recipe.dataVariant?.kind === 'optional_addition' ? {
    label: recipe.dataVariant.label, unit: optionalAnalysis?.unit || unit,
    output_quantity_text: fmtQty(optionalAnalysis?.outputQuantity ?? outputQty),
    sections: (optionalAnalysis?.sections ?? []).map((section) => ({
      key: section.key, label: section.label, rows: rows(section.lines),
      total_text: fmtMoney(calculatedAddon?.sectionTotals[section.key] ?? optionalAnalysis?.sectionTotals[section.key] ?? 0)
    })),
    labour_allowance_percent: calculatedAddon?.labourAllowancePercent ?? 0,
    labour_allowance_text: fmtMoney(calculatedAddon?.labourAllowanceAmount ?? 0),
    overhead_percent: calculatedAddon?.overheadPercent ?? optionalAnalysis?.overheadPercent ?? 0,
    overhead_text: fmtMoney(calculatedAddon?.overheadAmount ?? optionalAnalysis?.overheadAmount ?? 0),
    lead_rows: leadRows(addonLeadApplications), lead_total_text: fmtMoney(addonLeadCost),
    total_cost_text: fmtMoney(addonCostBeforeLead + addonLeadCost),
    base_rate_text: fmtMoney(recipe.dataVariant.baseRate),
    addon_rate_text: fmtMoney((recipe.dataVariant.addOnRate ?? optionalAnalysis?.rate ?? 0) + addonLeadRate),
    adopted_rate_text: fmtMoney(recipe.dataVariant.rate + addonLeadRate),
    lead_note: recipe.dataVariant.addonLead ? {
      applicable: recipe.dataVariant.addonLead.applicable,
      material: recipe.dataVariant.addonLead.materialName || 'add-on material',
      conveyance_class: recipe.dataVariant.addonLead.conveyanceClass ?? 'applicable',
      quantity_basis: recipe.dataVariant.addonLead.quantityRatio !== null
        ? `${fmtQty(recipe.dataVariant.addonLead.quantityRatio)} ${recipe.dataVariant.addonLead.materialUnit} per ${unit}` : 'quantity-based',
      distance_note: recipe.dataVariant.addonLead.distanceRule === 'CHARGE_BEYOND_INCLUDED'
        ? `Charge only beyond the included first ${fmtQty(recipe.dataVariant.addonLead.includedLeadM)} m.` : 'Charge the full source-to-site distance.',
      handling_note: `${recipe.dataVariant.addonLead.loadingIncluded ? 'Loading is already included; do not add it again. ' : ''}${!recipe.dataVariant.addonLead.unloadingAddedByDefault ? 'Unloading is zero unless separately admitted.' : ''}`,
      note: recipe.dataVariant.addonLead.note ?? ''
    } : null,
    seigniorage_note: recipe.dataVariant.addonSeigniorage ? {
      applicable: recipe.dataVariant.addonSeigniorage.applicable,
      codes: recipe.dataVariant.addonSeigniorage.codes.join(', '),
      blocked: recipe.dataVariant.addonSeigniorage.conversionRequired && !recipe.dataVariant.addonSeigniorage.conversionConfigured
    } : null
  } : null
  const totals = {
    material_total: matTotal,
    labour_total: labTotal,
    machinery_total: machTotal,
    base_cost: baseCost,
    overhead_percent: overheadPct,
    overhead_amount: overheadAmt,
    area_allowance_percent: areaAllowancePct,
    area_allowance_amount: areaAllowanceAmt,
    labour_unit_base: labUnitBase,
    labour_unit_profit: labUnitProfit,
    labour_unit_total: labUnitTotal,
    lead_total: leadTotalAmount,
    total_cost: totalCost,
    rate_per_unit: ratePerUnit,
    output_quantity: outputQty
  }
  return {
    code, unit, description: desc, description_runs: printableRuns(desc, layout.descriptionRuns),
    section_heading: sectionHeading, document_title: documentTitle,
    visibility: {
      code: layout.codeVisible, description: layout.descriptionVisible, unit_quantity: layout.unitQuantityVisible,
      materials: layout.sections.materials.visible, machinery: layout.sections.machinery.visible,
      labour: layout.sections.labour.visible, labour_summary: layout.labourSummary.visible,
      abstract: layout.abstract.visible
    },
    labour_summary_rows: presentation.normalizedLabourRows,
    abstract_rows: presentation.normalizedAbstractRows.map((row) => ({
      ...row,
      is_rate: /^rate per/i.test(row.label),
      is_total_cost: /^total cost for/i.test(row.label),
      is_total: row.qualifier.toLowerCase() === 'total',
      is_caption: /^vertical lift gates/i.test(row.label)
    })),
    dual_measurement: presentation.dualMeasurement ? {
      rows: (recipe.publishedRateBlocks ?? []).map((block) => ({
        label: block.label, quantity_text: fmtQty(block.outputQuantity), unit: block.unit,
        cost_text: fmtMoney(recipe.recalculation ? presentation.summary.totalCost : block.totalCost ?? presentation.summary.totalCost),
        rate_text: fmtMoney(recipe.recalculation ? presentation.summary.totalCost / (block.outputQuantity || 1) : block.rate),
        primary: block.primary
      }))
    } : null,
    published_blocks: !presentation.dualMeasurement ? (recipe.publishedRateBlocks ?? []).map((block) => {
      const included = recipe.dataVariant?.componentRates?.some((rate) => Math.abs(block.rate - rate) < 0.011) ?? false
      const adopted = included || (recipe.dataVariant?.rate === undefined ? block.primary : Math.abs(block.rate - recipe.dataVariant.rate) < 0.011)
      return {
        label: block.label, quantity_text: fmtQty(block.outputQuantity), unit: block.unit,
        cost_text: block.totalCost === undefined ? '' : fmtMoney(block.totalCost), rate_text: fmtMoney(block.rate),
        adopted, adopted_label: included ? 'Included in adopted DATA' : recipe.dataVariant?.rate === undefined ? 'Primary DATA' : 'Adopted DATA'
      }
    }) : [],
    multi_rate_note: recipe.multiRateClassification ? {
      label: recipe.multiRateClassification.label,
      note: recipe.multiRateClassification.note,
      adopted_rate_text: fmtMoney(recipe.multiRateClassification.adoptedRate)
    } : null,
    rate_variant: recipe.dataVariant?.postRate && recipe.dataVariant.postRateSteps === undefined && recipe.dataVariant.addPercent !== undefined ? {
      selected_label: recipe.dataVariant.label,
      base_label: recipe.dataVariant.baseVariantLabel ?? 'Base class',
      base_rate_text: fmtMoney(presentation.summary.ratePerUnit),
      percent: recipe.dataVariant.addPercent,
      addition_text: fmtMoney(presentation.adoptedSummary.ratePerUnit - presentation.summary.ratePerUnit),
      adopted_rate_text: fmtMoney(presentation.adoptedSummary.ratePerUnit)
    } : null,
    materials: rows(matLines), machinery: rows(machLines), labour: rows(labLines), totals,
    display: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, fmtMoney(value)])),
    area_allowance_label: recipe.areaAllowanceLabel || String(areaAllowancePct) + '%',
    leads: leadRows(regularLeadApplications),
    lead_summary: {
      base_amount_text: fmtMoney(baseFinalAmount),
      lead_total_text: fmtMoney(regularLeadApplications.reduce((sum, app) => sum + app.grossAmount, 0)),
      final_amount_text: fmtMoney(baseFinalAmount + regularLeadApplications.reduce((sum, app) => sum + app.grossAmount, 0)),
      final_rate_text: fmtMoney((baseFinalAmount + regularLeadApplications.reduce((sum, app) => sum + app.grossAmount, 0)) / outputQty),
      disposal_only: regularLeadApplications.length > 0 && regularLeadApplications.every((app) => isDisposalLead(leadVariants.find((v) => v.id === app.variantId)))
    },
    optional_addition: optionalAddition
  }
}

export interface TypstDocumentOptions {
  projectName?: string; sorYear?: string; sorZone?: string; fontScale?: number
  pageSize?: PaperSize; orientation?: 'portrait' | 'landscape'
  figurePaths?: Record<string, Array<{ path: string; caption: string }>>
  signature?: SignatureFooterSettings
}
export function dataTypstTemplate(): string { return defaultTemplate }
export function dataSheetsCompileInputs(sheets: DataSheet[], options: TypstDocumentOptions = {}): Record<string, string> {
  const signature = options.signature
  return { 'ee-data': JSON.stringify({
    project: options.projectName || 'Detailed Estimate', year: options.sorYear || '', zone: options.sorZone || '',
    setup: { paper: options.pageSize === 'Letter' ? 'us-letter' : options.pageSize === 'Legal' ? 'us-legal' : (options.pageSize || 'A4').toLowerCase(), flipped: options.orientation === 'landscape', font_size: 9.5 * (options.fontScale || 1) },
    sor: sheets.filter(s => s.recipe.itemSource === 'SOR').map((s, i) => ({
      sl: i + 1, description: s.recipe.description, unit: s.recipe.unit || 'unit',
      rate: s.sorPrintRate?.hasNumericRate ? s.sorPrintRate.finalRate : null,
      rate_text: s.sorPrintRate?.hasNumericRate ? fmtMoney(s.sorPrintRate.finalRate) : s.sorPrintRate?.rateText || 'Rate not published'
    })),
    recipes: sheets.filter(s => s.recipe.itemSource !== 'SOR').map(s => ({
      ...buildRateAnalysisRenderData(s.recipe, s.leadApplications, s.leadVariants),
      figures: options.figurePaths?.[s.id] ?? []
    })),
    signature: signature?.enabled ? {
      placement: signature.placement,
      rows: printableSignatureRows(signature).map(row => ({ designation: row.designation, office: row.office }))
    } : { placement: 'subject_end', rows: [] }
  }) }
}

export function resolvedDataTypstSource(project: EestimateProject): string {
  return applyDocumentSettingsToTypst(
    defaultTemplate,
    resolveProjectDocumentSettings(project.projectPrintSettings)
  )
}

export function dataSignatureSettings(project: EestimateProject): SignatureFooterSettings {
  return resolveSignatureFooter(project, DATA_SIGNATURE_SCOPE)
}
export function rateAnalysisCompileInputs(recipe: RateAnalysisRecipe, project: EestimateProject | null,
  applications: LeadApplication[] = [], variants: LeadVariant[] = []): Record<string, string> {
  return { 'ee-data': JSON.stringify({ project: project?.meta.name || 'Estimate', year: project?.meta.sorYear || '',
    setup: { paper: 'a4', flipped: false, font_size: 10 }, sor: [],
    recipes: [buildRateAnalysisRenderData(recipe, applications, variants)] }) }
}
