import type {
  ConveyanceClass,
  MaterialRateOverride,
  ProjectDataDefinition,
  ProjectNode,
  ProjectSsrDataDefinition
} from '../types/project'
import type {
  RateAnalysisRecipe,
  RateAnalysisSection,
  RateAnalysisSectionKey
} from '../types/rateAnalysis'
import { recalculateRateAnalysis } from './rateAnalysis'
import { defaultRateAnalysisLayout } from './rateAnalysisVisibility'
import { projectItemKey } from './projectItems'
import {
  applyMaterialRateOverrides,
  fetchMaterialAliases,
  fetchMonthlyMaterials
} from './materialRates'

export const PROJECT_DATA_CATEGORY = 'project_data'

export const PROJECT_DATA_LEAD_MATERIALS: Array<{
  name: string
  conveyanceClass: ConveyanceClass
}> = [
  { name: 'Earth', conveyanceClass: 'EARTH' },
  { name: 'Sand', conveyanceClass: 'EARTH' },
  { name: 'Stone', conveyanceClass: 'STONE' },
  { name: 'Cement', conveyanceClass: 'CEMENT' },
  { name: 'Steel', conveyanceClass: 'STEEL' },
  { name: 'Slab/Wood', conveyanceClass: 'SLAB_WOOD' },
  { name: 'Water', conveyanceClass: 'WATER' },
  { name: 'Bricks', conveyanceClass: 'BRICKS' }
]

const SECTION_KEYS: RateAnalysisSectionKey[] = ['materials', 'machinery', 'labour']

export function projectDataForNode(
  definitions: ProjectDataDefinition[] | undefined,
  node: Pick<ProjectNode, 'projectDataId'>
): ProjectDataDefinition | undefined {
  if (!node.projectDataId) return undefined
  return definitions?.find((definition) => definition.id === node.projectDataId)
}

/** The Lead metadata format is deliberately the same format used by SSR DATA. */
export function projectDataLeadApplicability(definition: ProjectDataDefinition): unknown {
  const rowSelections = definition.kind === 'ssr'
    ? resolveProjectSsrSections(definition.sections)
        .filter((section) => section.key === 'materials' || section.key === 'machinery')
        .flatMap((section) => section.lines)
        .flatMap((line) =>
          line.lead?.applicable && line.lead.conveyanceClass
            ? [[line.lead.materialName?.trim() || line.description.trim(), line.lead.conveyanceClass] as const]
            : []
        )
    : []
  const overallSelection = definition.lead?.applicable &&
    definition.lead.conveyanceClass && definition.lead.materialName?.trim()
    ? [[definition.lead.materialName.trim(), definition.lead.conveyanceClass] as const]
    : []
  const selections = [...rowSelections, ...overallSelection]
  if (!selections.length) return {}
  const materials = Object.fromEntries(selections)
  return {
    classes: Array.from(new Set(selections.map(([, conveyanceClass]) => conveyanceClass))),
    materials,
    ...(definition.lead?.applicable && definition.lead.policy
      ? { lead_policy: definition.lead.policy }
      : {})
  }
}

export function projectDataHasLead(definition: ProjectDataDefinition): boolean {
  const applicability = projectDataLeadApplicability(definition) as { materials?: unknown }
  return Boolean(
    applicability.materials &&
      typeof applicability.materials === 'object' &&
      Object.keys(applicability.materials).length
  )
}

export function projectDataLeadMaterialFor(description: string): {
  name: string
  conveyanceClass: ConveyanceClass
} | null {
  const normalized = description.toLowerCase()
  return PROJECT_DATA_LEAD_MATERIALS.find((material) => {
    const name = material.name.toLowerCase()
    if (name === 'earth') return /\b(?:earth|soil|embankment)\b/.test(normalized)
    if (name === 'stone') return /\b(?:stone|aggregate|gravel|metal)\b/.test(normalized)
    return name === 'slab/wood'
      ? /\b(?:slab|wood|timber)\b/.test(normalized)
      : new RegExp(`\\b${name}\\b`, 'i').test(normalized)
  }) ?? null
}

/**
 * Make a project DATA recipe participate in the same seigniorage material
 * pipeline as published SSR DATA. SSR definitions expose every Material row;
 * simple SOR definitions expose their one material row. A user can explicitly
 * turn this off on the definition before it is added to the estimate.
 */
export function projectDataSeigniorageApplicability(
  definition: ProjectDataDefinition
): RateAnalysisRecipe['seigniorageApplicability'] {
  if (definition.seigniorage?.applicable === false) return { applicable: false }

  const sourceLines = definition.kind === 'ssr'
    ? resolveProjectSsrSections(definition.sections)
        // Seigniorage applies to mineral/material rows only. Machinery,
        // fuel, and energy rows must never enter the charge calculation.
        .filter((section) => section.key === 'materials')
        .flatMap((section) => section.lines.filter((line) => line.seigniorageApplicable === true))
    : [{
        description: definition.description,
        unit: definition.unit,
        quantity: 1,
        resourceCode: definition.code,
        seigniorageApplicable: true,
        seigniorageCode: undefined
      }]
  const outputQuantity = definition.kind === 'ssr'
    ? Math.max(finiteNumber(definition.outputQuantity), 0.000001)
    : 1
  const rows = sourceLines
    .filter(
      (line) =>
        line.seigniorageApplicable !== false &&
        line.description.trim() &&
        finiteNumber(line.quantity) > 0
    )
    .map((line, index) => ({
      material_key: line.resourceCode?.trim() || `project-data-material-${index + 1}`,
      material_label: line.description.trim(),
      material_desc: line.description.trim(),
      recipe_material_desc: line.description.trim(),
      recipe_material_qty: finiteNumber(line.quantity),
      recipe_material_unit: line.unit.trim(),
      material_code: line.resourceCode?.trim() || null,
      seig_code: line.seigniorageCode?.trim() || null,
      charge_unit: line.unit.trim() || null,
      quantity_unit: line.unit.trim() || undefined,
      quantity_ratio: finiteNumber(line.quantity) / outputQuantity,
      conversion_factor: 1,
      conversion_required: false,
      quantity_basis: 'ITEM_QTY_X_RATIO' as const,
      mode: 'RECIPE_MATERIAL_RATIO' as const,
      item_unit: definition.unit,
      status: line.resourceCode?.trim() && line.seigniorageCode?.trim()
        ? 'PROJECT_DATA_SOR_AUTO_MATCH'
        : line.seigniorageCode?.trim()
          ? 'PROJECT_DATA_MANUAL_SELECTION'
          : 'PROJECT_DATA_MANUAL_SELECTION_REQUIRED',
      notes: line.resourceCode?.trim() && line.seigniorageCode?.trim()
        ? 'SOR resource; seigniorage charge is matched automatically.'
        : line.seigniorageCode?.trim()
          ? 'Manual resource; estimator selected the Seigniorage mineral charge.'
          : 'Manual resource; select the official Seigniorage mineral before a rate can be used.'
    }))
  return {
    schema_version: 3,
    applicable: true,
    source: 'project_data',
    rows,
    materials: rows
  }
}

/** Evaluate a small, safe arithmetic expression used only by the SSR DATA builder. */
export function evaluateProjectDataFormula(
  input: string,
  variables: Record<string, number>
): number | null {
  let expression = input.trim()
  if (expression.startsWith('=')) expression = expression.slice(1)
  expression = expression.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)')
  expression = expression.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (token) => {
    const value = variables[token.toUpperCase()]
    return Number.isFinite(value) ? String(value) : 'NaN'
  })
  if (!/^[\d+\-*/().\sNaN]+$/.test(expression) || expression.includes('NaN')) return null
  try {
    // The expression has been reduced to numerals and arithmetic operators only.
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${expression})`)()
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

/** Resolve builder-only rate expressions into the normal final SSR line values. */
export function resolveProjectSsrSections(
  sections: RateAnalysisSection[]
): RateAnalysisSection[] {
  const variables: Record<string, number> = {
    A: 0,
    B: 0,
    C: 0,
    MATERIALS: 0,
    MACHINERY: 0,
    LABOUR: 0,
    LABOR: 0,
    TOTAL: 0
  }
  let runningTotal = 0

  return SECTION_KEYS.map((key) => {
    const section = sections.find((candidate) => candidate.key === key) ?? {
      key,
      label: sectionLabel(key),
      lines: []
    }
    let sectionTotal = 0
    const lines = section.lines.map((line, index) => {
      // Project material circulars are an overlay, never part of the reusable DATA
      // definition. Older cloned definitions may have persisted that overlay, so
      // restore the original published rate before the currently adopted project
      // rate is applied again below.
      const withoutGlobalRate = line.rateOverride
        ? {
            ...line,
            rate: line.rateOverride.publishedRate,
            rateOverride: undefined,
            editedFields: line.editedFields?.filter((field) => field !== 'rate')
          }
        : line
      const enteredRate = finiteNumber(withoutGlobalRate.rate)
      const formulaRate = withoutGlobalRate.rateFormula?.trim()
        ? evaluateProjectDataFormula(withoutGlobalRate.rateFormula, variables)
        : null
      const rate = formulaRate ?? enteredRate
      const quantity = finiteNumber(withoutGlobalRate.quantity)
      const amount = roundMoney(quantity * rate)
      const resolved = { ...withoutGlobalRate, quantity, rate, amount }
      const number = index + 1
      for (const prefix of sectionFormulaPrefixes(key)) {
        variables[`${prefix}${number}`] = amount
        variables[`${prefix}${number}_RATE`] = rate
      }
      sectionTotal = roundMoney(sectionTotal + amount)
      runningTotal = roundMoney(runningTotal + amount)
      variables.TOTAL = runningTotal
      return resolved
    })
    const letter = key === 'materials' ? 'A' : key === 'machinery' ? 'B' : 'C'
    variables[letter] = sectionTotal
    variables[key.toUpperCase()] = sectionTotal
    if (key === 'labour') variables.LABOR = sectionTotal
    return { ...section, key, lines }
  })
}

/** Formula references offered by the builder for the rows already above the current one. */
export function projectSsrFormulaReferences(
  sections: RateAnalysisSection[],
  sectionKey: RateAnalysisSectionKey,
  lineIndex: number
): Array<{ token: string; label: string }> {
  const refs: Array<{ token: string; label: string }> = [
    { token: 'A', label: 'A — materials total' },
    { token: 'B', label: 'B — machinery total' },
    { token: 'C', label: 'C — labour total' },
    { token: 'TOTAL', label: 'TOTAL — prior line total' }
  ]
  const keyIndex = SECTION_KEYS.indexOf(sectionKey)
  for (let index = 0; index <= keyIndex; index += 1) {
    const key = SECTION_KEYS[index]
    const source = sections.find((section) => section.key === key)
    const maximum = key === sectionKey ? lineIndex : source?.lines.length ?? 0
    for (let row = 0; row < maximum; row += 1) {
      const line = source?.lines[row]
      const prefix = sectionFormulaPrefixes(key)[0]
      const number = row + 1
      const name = line?.description.trim() || `${key} row ${number}`
      refs.push({ token: `${prefix}${number}_RATE`, label: `${prefix}${number} rate — ${name}` })
      refs.push({ token: `${prefix}${number}`, label: `${prefix}${number} amount — ${name}` })
    }
  }
  return refs
}

export function projectDataRate(definition: ProjectDataDefinition): number {
  if (definition.kind === 'sor') return definition.rate
  const sectionTotals = Object.fromEntries(
    resolveProjectSsrSections(definition.sections).map((section) => [
      section.key,
      roundMoney(section.lines.reduce((total, line) => total + line.amount, 0))
    ])
  ) as Record<RateAnalysisSectionKey, number>
  const subtotal = roundMoney(sectionTotals.materials + sectionTotals.machinery + sectionTotals.labour)
  const total = roundMoney(subtotal * (1 + Math.max(0, finiteNumber(definition.overheadPercent)) / 100))
  const outputQuantity = Math.max(finiteNumber(definition.outputQuantity), 0.000001)
  return roundMoney(total / outputQuantity)
}

/** Convert a project DATA definition into a normal DATA recipe for all dashboards and prints. */
export async function projectDataRecipe(
  definition: ProjectDataDefinition,
  node: ProjectNode,
  year: string,
  zone: 'zone_1' | 'zone_2' | 'zone_3',
  materialRateOverrides?: Record<string, MaterialRateOverride>
): Promise<RateAnalysisRecipe> {
  if (definition.kind === 'sor') {
    return withProjectMaterialRateOverrides(
      projectSorDataRecipe(definition, node, year, zone),
      materialRateOverrides
    )
  }

  const sections = resolveProjectSsrSections(definition.sections)
  const sectionTotals = Object.fromEntries(
    sections.map((section) => [
      section.key,
      roundMoney(section.lines.reduce((total, line) => total + line.amount, 0))
    ])
  ) as Record<RateAnalysisSectionKey, number>
  const baseRate = projectDataRate(definition)
  const recipe: RateAnalysisRecipe = {
    schemaVersion: 1,
    itemKey: projectItemKey(node),
    itemSource: 'SSR',
    categoryKey: PROJECT_DATA_CATEGORY,
    itemCode: definition.code,
    documentTitle: `Project SSR DATA · ${definition.code}`,
    description: definition.description,
    unit: definition.unit,
    outputQuantity: Math.max(finiteNumber(definition.outputQuantity), 0.000001),
    year,
    zone,
    overheadPercent: Math.max(0, finiteNumber(definition.overheadPercent)),
    sections,
    layout: defaultRateAnalysisLayout(definition.description),
    storedValues: {
      sectionTotals: {
        materials: String(sectionTotals.materials),
        machinery: String(sectionTotals.machinery),
        labour: String(sectionTotals.labour)
      },
      labourExtract: [],
      abstract: []
    },
    publishedRate: baseRate,
    projectDataImageUrl: definition.imageDataUrl,
    leadApplicability: projectDataLeadApplicability(definition),
    seigniorageApplicability: projectDataSeigniorageApplicability(definition),
    unresolvedLines: 0
  }
  return withProjectMaterialRateOverrides(recalculateRateAnalysis(recipe), materialRateOverrides)
}

/**
 * Created SSR DATA uses the same monthly-material engine as published SSR/SOR DATA.
 * Lines explicitly entered or rate-edited by the estimator remain locked; selected
 * SOR material resources and cloned backend rows continue to follow the project rate.
 */
async function withProjectMaterialRateOverrides(
  recipe: RateAnalysisRecipe,
  overrides: Record<string, MaterialRateOverride> | undefined
): Promise<RateAnalysisRecipe> {
  if (!overrides || !Object.keys(overrides).length) return recipe
  const [aliases, monthlyMaterials] = await Promise.all([
    fetchMaterialAliases(),
    fetchMonthlyMaterials()
  ])
  const materials = new Map(monthlyMaterials.map((entry) => [entry.materialCode, entry]))
  const { recipe: applied, applications } = applyMaterialRateOverrides(
    recipe,
    overrides,
    aliases,
    materials
  )
  if (!applications.length) return applied
  if (applied.itemSource === 'SOR') {
    const overriddenLine = applied.sections
      .flatMap((section) => section.lines)
      .find((line) => line.rateOverride)
    return overriddenLine ? { ...applied, publishedRate: overriddenLine.rate } : applied
  }
  return recalculateRateAnalysis({ ...applied, recalculation: undefined })
}

function projectSorDataRecipe(
  definition: Extract<ProjectDataDefinition, { kind: 'sor' }>,
  node: ProjectNode,
  year: string,
  zone: 'zone_1' | 'zone_2' | 'zone_3'
): RateAnalysisRecipe {
  const materialSection: RateAnalysisSectionKey = 'materials'
  return {
    schemaVersion: 1,
    itemKey: projectItemKey(node),
    itemSource: 'SOR',
    categoryKey: PROJECT_DATA_CATEGORY,
    itemCode: definition.code,
    documentTitle: `Project SOR DATA · ${definition.code}`,
    description: definition.description,
    unit: definition.unit,
    outputQuantity: 1,
    year,
    zone,
    overheadPercent: 0,
    sections: SECTION_KEYS.map((key) => ({
      key,
      label: sectionLabel(key),
      lines:
        key === materialSection
          ? [
              {
                id: 'project-data-rate',
                slNo: '1',
                description: definition.description,
                unit: definition.unit,
                quantity: 1,
                rate: definition.rate,
                amount: definition.rate,
                resourceCode: definition.code,
                rateSource: 'Project DATA library'
              }
            ]
          : []
    })),
    publishedRate: definition.rate,
    projectDataImageUrl: definition.imageDataUrl,
    leadApplicability: projectDataLeadApplicability(definition),
    seigniorageApplicability: projectDataSeigniorageApplicability(definition),
    unresolvedLines: 0
  }
}

function sectionFormulaPrefixes(key: RateAnalysisSectionKey): string[] {
  if (key === 'materials') return ['MAT', 'MATERIAL']
  if (key === 'machinery') return ['MAC', 'MACHINERY']
  return ['LAB', 'LABOUR', 'LABOR']
}

function sectionLabel(key: RateAnalysisSectionKey): string {
  if (key === 'materials') return 'A. Materials'
  if (key === 'machinery') return 'B. Machinery'
  return 'C. Labour'
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
