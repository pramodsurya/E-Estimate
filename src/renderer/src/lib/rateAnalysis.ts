import { supabase } from './supabase'
import { projectItemKey } from './projectItems'
import { parseRateAnalysisVisibility } from './rateAnalysisVisibility'
import type { ProjectNode } from '../types/project'
import type {
  RateAnalysisCalculationTrace,
  RateAnalysisLine,
  RateAnalysisRecalculation,
  RateAnalysisRecipe,
  RateAnalysisSectionKey,
  RateAnalysisStoredRow,
  RateAnalysisSummary,
  RateAnalysisTextRun,
  SeigniorageMaterialPolicy
} from '../types/rateAnalysis'

type JsonRecord = Record<string, unknown>
type SorZone = 'zone_1' | 'zone_2' | 'zone_3'
type SorRef = {
  table: 'labour_rate' | 'machinery_rate'
  code: string
  component?: string
}

interface RateAnalysisFetchOptions {
  zone?: SorZone
  areaAllowancePercent?: number
  areaAllowanceLabel?: string
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

const SECTION_LABELS: Record<RateAnalysisSectionKey, string> = {
  materials: 'A. Materials',
  machinery: 'B. Machinery',
  labour: 'C. Labour'
}

const SSR_CATEGORIES = new Set(['taw', 'daw', 'caw', 'gaw', 'ccdw', 'pmw'])
const SSR_ITEM_TABLE = 'ssr_item'
const SSR_YEAR_TABLE = 'ssr_year'
const SSR_DOCUMENT_TITLES: Record<string, string> = {
  'IRR-TAW': 'Tunnel and Allied Works',
  'IRR-DAW': 'Dam and Allied Works',
  'IRR-CAW': 'Canal and Allied Works',
  'IRR-GAW': 'Gates and Allied Works',
  'IRR-CCDW': 'Canal and Cross Drainage Works',
  'IRR-PMW': 'Project Miscellaneous Works'
}

const DEFAULT_ZONE: SorZone = 'zone_3'

const SOR_CONFIG: Record<
  string,
  { codeCol: string; nameCol: string; rateTable: string; rateFields: string[] }
> = {
  material: {
    codeCol: 'material_code',
    nameCol: 'name',
    rateTable: 'material_rate',
    rateFields: ['rate']
  },
  labour: {
    codeCol: 'labour_code',
    nameCol: 'name',
    rateTable: 'labour_rate',
    rateFields: ['rate']
  },
  machinery: {
    codeCol: 'machinery_code',
    nameCol: 'name',
    rateTable: 'machinery_rate',
    rateFields: ['hire_total', 'hire_charge']
  },
  plumbing: {
    codeCol: 'plumbing_code',
    nameCol: 'name',
    rateTable: 'plumbing_rate',
    rateFields: ['rate']
  },
  electrical: {
    codeCol: 'elec_code',
    nameCol: 'name',
    rateTable: 'electrical_rate',
    rateFields: ['rate']
  },
  civil: {
    codeCol: 'civil_code',
    nameCol: 'name',
    rateTable: 'civil_rate',
    rateFields: ['rate']
  }
}

const RATE_TABLE_CODE_COLUMNS: Record<string, string> = {
  material_rate: 'material_code',
  machinery_rate: 'machinery_code',
  labour_rate: 'labour_code',
  plumbing_rate: 'plumbing_code',
  electrical_rate: 'elec_code',
  civil_rate: 'civil_code',
  taw_rates: 'taw_code',
  daw_rates: 'daw_code',
  caw_rates: 'caw_code',
  gaw_rates: 'gaw_code',
  ccdw_rates: 'ccdw_code',
  pmw_rates: 'pmw_code'
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value)
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundRate(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10
}

function cloneRecipe(recipe: RateAnalysisRecipe): RateAnalysisRecipe {
  return JSON.parse(JSON.stringify(recipe)) as RateAnalysisRecipe
}

export function calculateRateAnalysis(recipe: RateAnalysisRecipe): RateAnalysisSummary {
  if (recipe.recalculation) {
    const labour =
      recipe.recalculation.labourExtract ??
      buildRecalculatedLabourSummary(
        recipe,
        numberValue(recipe.recalculation.sectionTotals.labour)
      ).rows
    return {
      sectionTotals: {
        materials: numberValue(recipe.recalculation.sectionTotals.materials),
        machinery: numberValue(recipe.recalculation.sectionTotals.machinery),
        labour: numberValue(recipe.recalculation.sectionTotals.labour)
      },
      baseCost: numberValue(recipe.recalculation.subtotal),
      overheadAmount: roundMoney(
        numberValue(recipe.recalculation.finalCost) - numberValue(recipe.recalculation.subtotal)
      ),
      totalCost: numberValue(recipe.recalculation.finalCost),
      ratePerUnit: numberValue(recipe.recalculation.calculatedRate),
      labourUnitBase: numberValue(
        labour.find((row) => /labour component\/unit qty$/i.test(row.label))?.value
      ),
      labourUnitProfit: numberValue(
        labour.find((row) => /contractor|overhead/i.test(row.label))?.value
      ),
      labourUnitTotal: numberValue(
        [...labour]
          .reverse()
          .find((row) => /labour component\/unit qty/i.test(row.label))?.value
      )
    }
  }

  if (recipe.storedValues) {
    const abstract = recipe.storedValues.abstract
    const labour = recipe.storedValues.labourExtract
    const sectionTotals = {
      materials: numberValue(recipe.storedValues.sectionTotals.materials),
      machinery: numberValue(recipe.storedValues.sectionTotals.machinery),
      labour: numberValue(recipe.storedValues.sectionTotals.labour)
    }
    const hasAreaAllowance = numberValue(recipe.areaAllowancePercent) > 0
    const baseCost = hasAreaAllowance
      ? roundMoney(sectionTotals.materials + sectionTotals.machinery + sectionTotals.labour)
      : numberValue(abstract[3]?.amount)
    const overheadAmount = hasAreaAllowance
      ? roundMoney((baseCost * numberValue(recipe.overheadPercent)) / 100)
      : numberValue(
          abstract.find((row) => /contractor|overhead/i.test(row.label) && row.amount)?.amount
        )
    const totalCost = hasAreaAllowance
      ? roundMoney(baseCost + overheadAmount)
      : numberValue(
          [...abstract].reverse().find((row) => /total cost/i.test(row.label))?.amount
        )
    return {
      sectionTotals,
      baseCost,
      overheadAmount,
      totalCost,
      ratePerUnit: hasAreaAllowance
        ? roundRate(totalCost / (numberValue(recipe.outputQuantity, 1) || 1))
        : numberValue([...abstract].reverse().find((row) => row.amount)?.amount),
      labourUnitBase: numberValue(
        labour.find((row) => /labour component\/unit qty$/i.test(row.label))?.value
      ),
      labourUnitProfit: numberValue(
        labour.find((row) => /contractor|overhead/i.test(row.label))?.value
      ),
      labourUnitTotal: numberValue(
        [...labour]
          .reverse()
          .find((row) => /labour component\/unit qty/i.test(row.label))?.value
      )
    }
  }

  const sectionTotals = {
    materials: 0,
    machinery: 0,
    labour: 0
  }

  for (const section of recipe.sections) {
    sectionTotals[section.key] = roundMoney(
      section.lines.reduce((total, line) => total + numberValue(line.amount), 0)
    )
  }

  const baseCost = roundMoney(
    sectionTotals.materials + sectionTotals.machinery + sectionTotals.labour
  )
  const overheadAmount = roundMoney((baseCost * numberValue(recipe.overheadPercent)) / 100)
  const totalCost = roundMoney(baseCost + overheadAmount)
  const outputQuantity = numberValue(recipe.outputQuantity, 1) || 1
  const labourUnitBase = roundRate(sectionTotals.labour / outputQuantity)
  const labourUnitProfit = roundRate(
    (labourUnitBase * numberValue(recipe.overheadPercent)) / 100
  )

  return {
    sectionTotals,
    baseCost,
    overheadAmount,
    totalCost,
    ratePerUnit: roundRate(totalCost / outputQuantity),
    labourUnitBase,
    labourUnitProfit,
    labourUnitTotal: roundRate(labourUnitBase + labourUnitProfit)
  }
}

export function labourRowsForDisplay(recipe: RateAnalysisRecipe): RateAnalysisStoredRow[] {
  if (recipe.recalculation) {
    return (
      recipe.recalculation.labourExtract ??
      buildRecalculatedLabourSummary(
        recipe,
        numberValue(recipe.recalculation.sectionTotals.labour)
      ).rows
    )
  }
  return recipe.storedValues?.labourExtract ?? []
}

export function updateRateAnalysisLine(
  recipe: RateAnalysisRecipe,
  sectionKey: RateAnalysisSectionKey,
  lineId: string,
  patch: Partial<RateAnalysisLine>
): RateAnalysisRecipe {
  const changesCalculationInput = patch.quantity !== undefined || patch.rate !== undefined
  const sections = recipe.sections.map((section) => {
    if (section.key !== sectionKey) return section
    return {
      ...section,
      lines: section.lines.map((line) => {
        if (line.id !== lineId) return line
        const next = { ...line, ...patch }
        if (!changesCalculationInput) return next
        next.sourceValues = {
          ...line.sourceValues,
          quantity: patch.quantity === undefined ? line.sourceValues?.quantity : undefined,
          rate: patch.rate === undefined ? line.sourceValues?.rate : undefined,
          amount: line.sourceValues?.amount
        }
        return next
      })
    }
  })

  return changesCalculationInput
    ? { ...recipe, sections, recalculation: undefined, calculationStale: true }
    : { ...recipe, sections }
}

export function invalidateRateAnalysisCalculation(recipe: RateAnalysisRecipe): RateAnalysisRecipe {
  return { ...recipe, recalculation: undefined, calculationStale: true }
}

export function recalculateRateAnalysis(recipe: RateAnalysisRecipe): RateAnalysisRecipe {
  const trace: RateAnalysisCalculationTrace[] = []
  const sectionTotals = {
    materials: 0,
    machinery: 0,
    labour: 0
  }

  const sections = recipe.sections.map((section) => {
    let total = 0
    const lines = section.lines.map((line) => {
      const amount = roundMoney(numberValue(line.quantity) * numberValue(line.rate))
      total = roundMoney(total + amount)
      const recorded = numberFromText(line.sourceValues?.amount)
      trace.push({
        kind: 'line_item',
        section: section.key,
        description: line.description,
        quantity: formatCalculated(line.quantity),
        rate: formatCalculated(line.rate),
        recordedAmount: formatCalculated(recorded),
        calculatedAmount: formatCalculated(amount),
        amount: formatCalculated(amount),
        contributes: true,
        status: recorded === null || sameMoney(recorded, amount) ? 'matched' : 'derived'
      })
      return { ...line, amount }
    })
    sectionTotals[section.key] = total
    trace.push({
      kind: 'section_total',
      section: section.key,
      amount: formatCalculated(total),
      contributes: true,
      status: 'derived',
      formula: `sum of contributing ${section.key} line items`
    })
    return { ...section, lines }
  })

  const labourSummary = buildRecalculatedLabourSummary(recipe, sectionTotals.labour, sectionTotals)
  const abstractSectionTotals = {
    ...sectionTotals,
    labour: labourSummary.total
  }
  const subtotal = roundMoney(
    abstractSectionTotals.materials +
      abstractSectionTotals.machinery +
      abstractSectionTotals.labour
  )
  const sourceAbstract = calculationAbstractRows(recipe)
  const abstract = mergeCalculationAbstractRows(sourceAbstract)
  const warnings: string[] = []
  let current = subtotal
  let totalCostRow: RateAnalysisStoredRow | null = null
  let calculatedRate: number | null = null

  const calculatedAbstract = abstract.map((source) => {
    const row = { ...source }
    const recorded = numberFromText(row.amount)
    const text = rowText(row)
    const section = abstractSection(text)
    const formulaSource = rowFormula(row)
    const formulaAmount = formulaSource
      ? evaluateFormula(
          formulaSource,
          formulaVariables(recipe, sectionTotals, abstractSectionTotals, subtotal, current)
        )
      : null
    let amount = recorded
    let status: RateAnalysisCalculationTrace['status'] = 'recorded'
    let formula: string | undefined
    let contributes = false

    if (section) {
      amount = abstractSectionTotals[section]
      status = 'derived'
      formula = section === 'labour' ? 'sum(labour) plus labour summary allowances' : `sum(${section})`
      contributes = true
      if (recorded !== null && !sameMoney(recorded, amount)) {
        warnings.push(
          `${recipe.itemCode}: ${section} is ${formatCalculated(amount)} from rate lines but ${formatCalculated(recorded)} in the published abstract.`
        )
      }
    } else if (isTotalCostRow(text)) {
      totalCostRow = row
      amount = current
      status = 'derived'
      formula = 'running total'
    } else if (isRateRow(text)) {
      if (formulaSource) {
        if (formulaAmount === null) {
          warnings.push(`${recipe.itemCode}: could not evaluate formula "${formulaSource}".`)
        } else {
          amount = roundToPrintedGrid(formulaAmount, recorded)
          calculatedRate = amount
          status = 'derived'
          formula = formulaSource
        }
      } else {
        const denominator = calculationDenominator(row, totalCostRow, recipe.outputQuantity)
        if (denominator === null) {
          warnings.push(`${recipe.itemCode}: could not find the rate denominator.`)
        } else {
          const rawRate = current / denominator
          amount = roundToPrintedGrid(rawRate, recorded)
          calculatedRate = amount
          status = 'derived'
          formula = `running total / ${formatCalculated(denominator)}`
        }
      }
    } else if (isTotalRow(text)) {
      if (formulaSource && formulaAmount !== null) {
        amount = roundMoney(formulaAmount)
        current = amount
        status = 'derived'
        formula = formulaSource
      } else {
        amount = current
        status = 'derived'
        formula = 'running total'
      }
    } else {
      const percent = percentageFromRow(row)
      const isDeduction = /deduct.*rate/.test(text)
      const isAddition = /\badd\b|profit|overhead|transport/.test(text)
      const manualAmount =
        row.amountOverride || (row.userAdded && (percent === null || !isAddition))
      const explicitAmount = formulaSource ? formulaAmount : manualAmount ? recorded : null
      if (formulaSource && formulaAmount === null) {
        warnings.push(`${recipe.itemCode}: could not evaluate formula "${formulaSource}".`)
        status = 'heading'
        formula = formulaSource
      } else if (explicitAmount !== null) {
        amount = roundMoney(explicitAmount)
        current = roundMoney(current + (isDeduction ? -amount : amount))
        status = formulaSource ? 'derived' : 'recorded_adjustment'
        formula = formulaSource ?? 'manual amount'
        contributes = true
      } else if (percent !== null && isAddition && !isDeduction) {
        const basis = choosePercentageBasis(
          text,
          recorded,
          percent,
          abstractSectionTotals,
          subtotal,
          current
        )
        amount = roundMoney((basis.value * percent) / 100)
        current = roundMoney(current + amount)
        status = 'derived'
        formula = `${formatCalculated(percent)}% of ${basis.name}`
        contributes = true
      } else if (isFinancialAdjustment(text) && recorded !== null) {
        current = roundMoney(current + (/deduct/.test(text) ? -recorded : recorded))
        amount = recorded
        status = 'recorded_adjustment'
        formula = 'published adjustment'
        contributes = true
      } else if (recorded === null) {
        status = 'heading'
        formula = 'does not contribute'
      }
    }

    if (amount !== null) row.amount = formatCalculated(amount)
    trace.push({
      kind: 'abstract_row',
      label: row.label,
      recordedAmount: formatCalculated(recorded),
      amount: formatCalculated(amount),
      contributes,
      status,
      formula
    })
    return row
  })

  const publishedBaseRate = numberValue(recipe.publishedRate, Number.NaN)
  if (calculatedRate !== null && Number.isFinite(publishedBaseRate) && !sameMoney(calculatedRate, publishedBaseRate)) {
    warnings.push(
      `${recipe.itemCode}: published base rate ${formatCalculated(publishedBaseRate)} differs from recalculated rate ${formatCalculated(calculatedRate)}.`
    )
  }

  const recalculation: RateAnalysisRecalculation = {
    sectionTotals: {
      materials: formatCalculated(sectionTotals.materials),
      machinery: formatCalculated(sectionTotals.machinery),
      labour: formatCalculated(sectionTotals.labour)
    },
    subtotal: formatCalculated(subtotal),
    finalCost: formatCalculated(current),
    calculatedRate: formatCalculated(calculatedRate),
    publishedBaseRate: formatCalculated(publishedBaseRate),
    labourExtract: labourSummary.rows,
    abstract: calculatedAbstract,
    trace,
    warnings
  }

  return { ...recipe, sections, recalculation, calculationStale: false }
}

function numberFromText(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const match = String(value).replaceAll(',', '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function rowFormula(row: RateAnalysisStoredRow): string | null {
  for (const value of [row.amount, row.value, row.basis]) {
    const text = String(value ?? '').trim()
    if (text.startsWith('=')) return text
  }
  return null
}

function formulaVariables(
  recipe: RateAnalysisRecipe,
  lineSectionTotals: Record<RateAnalysisSectionKey, number>,
  abstractSectionTotals: Record<RateAnalysisSectionKey, number>,
  subtotal: number,
  current: number
): Record<string, number> {
  const out: Record<string, number> = {
    A: abstractSectionTotals.materials,
    B: abstractSectionTotals.machinery,
    C: abstractSectionTotals.labour,
    MATERIALS: abstractSectionTotals.materials,
    MACHINERY: abstractSectionTotals.machinery,
    LABOUR: abstractSectionTotals.labour,
    LABOR: abstractSectionTotals.labour,
    MATERIAL_LINES: lineSectionTotals.materials,
    MACHINERY_LINES: lineSectionTotals.machinery,
    LABOUR_LINES: lineSectionTotals.labour,
    LABOR_LINES: lineSectionTotals.labour,
    ABC: subtotal,
    SUBTOTAL: subtotal,
    TOTAL: current,
    CURRENT: current,
    QTY: outputQuantity(recipe),
    QUANTITY: outputQuantity(recipe),
    OUTPUT: outputQuantity(recipe),
    OVERHEAD: recipe.overheadPercent,
    RATE: current / outputQuantity(recipe)
  }

  const prefixes: Record<RateAnalysisSectionKey, string[]> = {
    materials: ['MAT', 'MATERIAL'],
    machinery: ['MAC', 'MACHINERY'],
    labour: ['LAB', 'LABOUR', 'LABOR']
  }
  for (const section of recipe.sections) {
    section.lines.forEach((line, index) => {
      const amount = numberValue(line.amount)
      const rate = numberValue(line.rate)
      const n = index + 1
      for (const prefix of prefixes[section.key]) {
        out[`${prefix}${n}`] = amount
        out[`${prefix}${n}_RATE`] = rate
      }
    })
  }
  return out
}

function evaluateFormula(input: string, variables: Record<string, number>): number | null {
  let expression = input.trim()
  if (expression.startsWith('=')) expression = expression.slice(1)
  expression = expression.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)')
  expression = expression.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (token) => {
    const value = variables[token.toUpperCase()]
    return Number.isFinite(value) ? String(value) : 'NaN'
  })
  if (!/^[\d+\-*/().\sNaN]+$/.test(expression)) return null
  if (expression.includes('NaN')) return null
  try {
    // Expression is limited to numbers, arithmetic operators and parentheses.
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${expression})`)()
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function buildRecalculatedLabourSummary(
  recipe: RateAnalysisRecipe,
  labourLineTotal: number,
  lineSectionTotals?: Record<RateAnalysisSectionKey, number>
): {
  rows: RateAnalysisStoredRow[]
  total: number
  unitBase: number
  unitProfit: number
  unitTotal: number
} {
  const sourceRows = recipe.storedValues?.labourExtract.length
    ? recipe.storedValues.labourExtract
    : defaultLabourSummaryRows(recipe)
  const rows: RateAnalysisStoredRow[] = []
  let current = roundMoney(labourLineTotal)
  let unitBase = roundRate(current / outputQuantity(recipe))
  let contractorPercent = recipe.overheadPercent
  let unitProfit = roundRate((unitBase * contractorPercent) / 100)
  let unitTotal = roundRate(unitBase + unitProfit)
  let seenLineTotal = false
  let enteredUnitComponent = false

  for (let index = 0; index < sourceRows.length; index += 1) {
    const source = sourceRows[index]
    const row = { ...source }
    const text = rowText(row)
    const percent = percentageFromRow(row) ?? followingPercent(sourceRows, index)
    const totalsForFormula = lineSectionTotals ?? {
      materials: 0,
      machinery: 0,
      labour: labourLineTotal
    }
    const formulaSource = rowFormula(row)
    const formulaAmount = formulaSource
      ? evaluateFormula(
          formulaSource,
          formulaVariables(
            recipe,
            totalsForFormula,
            { ...totalsForFormula, labour: current },
            totalsForFormula.materials + totalsForFormula.machinery + current,
            current
          )
        )
      : null

    if (isLabourUnitTotalRow(text)) {
      enteredUnitComponent = true
      row.amount = formatCalculated(unitTotal)
      rows.push(row)
      continue
    }

    if (isLabourUnitBaseRow(text)) {
      enteredUnitComponent = true
      unitBase = roundRate(current / outputQuantity(recipe))
      unitProfit = roundRate((unitBase * contractorPercent) / 100)
      unitTotal = roundRate(unitBase + unitProfit)
      row.amount = formatCalculated(unitBase)
      rows.push(row)
      continue
    }

    if (isContractorLabourRow(text)) {
      enteredUnitComponent = true
      contractorPercent = percent ?? contractorPercent
      unitProfit = roundRate((unitBase * contractorPercent) / 100)
      unitTotal = roundRate(unitBase + unitProfit)
      row.amount = formatCalculated(unitProfit)
      if (!row.percent && contractorPercent) row.percent = `${formatPercentValue(contractorPercent)}%`
      rows.push(row)
      continue
    }

    if (!enteredUnitComponent && row.userAdded) {
      const manualAmount = row.amountOverride || percent === null
      const explicitAmount = formulaSource
        ? formulaAmount
        : manualAmount
          ? numberFromText(row.amount)
          : null
      if (explicitAmount !== null) {
        const amount = roundMoney(explicitAmount)
        current = roundMoney(current + (/deduct/.test(text) ? -amount : amount))
        row.amount = formatCalculated(amount)
        rows.push(row)
        continue
      }
    }

    if (!enteredUnitComponent && isLabourTotalRow(text)) {
      row.amount = formatCalculated(current)
      seenLineTotal = true
      rows.push(row)
      continue
    }

    if (!enteredUnitComponent && isLabourAllowanceRow(text, percent)) {
      const amount = roundMoney((current * (percent ?? 0)) / 100)
      current = roundMoney(current + amount)
      row.amount = formatCalculated(amount)
      rows.push(row)
      continue
    }

    rows.push(row)
  }

  if (!seenLineTotal) {
    rows.unshift({
      label: 'Total cost of Labour',
      value: '',
      unit: '',
      basis: '',
      percent: '',
      amount: formatCalculated(labourLineTotal)
    })
  }

  if (!rows.some((row) => isLabourUnitBaseRow(rowText(row)))) {
    unitBase = roundRate(current / outputQuantity(recipe))
    unitProfit = roundRate((unitBase * contractorPercent) / 100)
    unitTotal = roundRate(unitBase + unitProfit)
    rows.push(
      {
        label: 'labour component/unit qty',
        value: '',
        unit: '',
        basis: '',
        percent: '',
        amount: formatCalculated(unitBase)
      },
      {
        label: "Add contractor's profit and overhead charges",
        value: '',
        unit: '',
        basis: '',
        percent: `${formatPercentValue(contractorPercent)}%`,
        amount: formatCalculated(unitProfit)
      },
      {
        label: "labour component/unit qty (including contractor's profit)",
        value: '',
        unit: '',
        basis: '',
        percent: '',
        amount: formatCalculated(unitTotal)
      }
    )
  }

  return { rows, total: current, unitBase, unitProfit, unitTotal }
}

function defaultLabourSummaryRows(recipe: RateAnalysisRecipe): RateAnalysisStoredRow[] {
  return [
    { label: 'Total cost of Labour', value: '', unit: '', basis: '', percent: '', amount: '' },
    { label: 'labour component/unit qty', value: '', unit: '', basis: '', percent: '', amount: '' },
    {
      label: "Add contractor's profit and overhead charges",
      value: '',
      unit: '',
      basis: '',
      percent: `${formatPercentValue(recipe.overheadPercent)}%`,
      amount: ''
    },
    {
      label: "labour component/unit qty (including contractor's profit)",
      value: '',
      unit: '',
      basis: '',
      percent: '',
      amount: ''
    }
  ]
}

function outputQuantity(recipe: RateAnalysisRecipe): number {
  return numberValue(recipe.outputQuantity, 1) || 1
}

function followingPercent(rows: RateAnalysisStoredRow[], index: number): number | null {
  const next = rows[index + 1]
  if (!next) return null
  if (!next?.label.trim() && !next?.value.trim()) return percentageFromRow(next)
  return null
}

function isLabourTotalRow(text: string): boolean {
  return /^total cost of labour\b/.test(text)
}

function isLabourAllowanceRow(text: string, percent: number | null): boolean {
  return percent !== null && /\badd\b/.test(text) && /labou?r|charges?/.test(text)
}

function isContractorLabourRow(text: string): boolean {
  return /contractor|overhead/.test(text)
}

function isLabourUnitBaseRow(text: string): boolean {
  return /labou?r component\/unit qty\b/.test(text) && !/including/.test(text)
}

function isLabourUnitTotalRow(text: string): boolean {
  return /labou?r component\/unit qty\b/.test(text) && /including/.test(text)
}

function formatPercentValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, '').replace(/\.$/, '')
}

function formatCalculated(value: number | null): string {
  return value !== null && Number.isFinite(value) ? roundMoney(value).toFixed(2) : ''
}

function sameMoney(left: number, right: number): boolean {
  return Math.abs(roundMoney(left) - roundMoney(right)) < 0.005
}

function rowText(row: RateAnalysisStoredRow): string {
  return `${row.label} ${row.basis} ${row.unit}`.replace(/\s+/g, ' ').trim().toLowerCase()
}

function abstractSection(text: string): RateAnalysisSectionKey | null {
  if (/^a\s*[.)]?\s*(cost of )?materials?\b/.test(text)) return 'materials'
  if (/^b\s*[.)]?\s*(hire charges? of |cost of )?(machinery|plant)\b/.test(text)) {
    return 'machinery'
  }
  if (/^c\s*[.)]?\s*(cost of )?labour\b/.test(text)) return 'labour'
  return null
}

function isRateRow(text: string): boolean {
  return /\b(?:rate|ate|te)\s+pe?r\b/.test(text)
}

function isTotalCostRow(text: string): boolean {
  return text.includes('total cost for')
}

function isTotalRow(text: string): boolean {
  return /\btotal\b/.test(text) || text === 'tdo. tal' || text === 't do tal'
}

function isFinancialAdjustment(text: string): boolean {
  return /lead charges?|unloading charges?|loading charges?|add rate|deduct rate|sundries|royalty|seigniorage/.test(text)
}

function percentageFromRow(row: RateAnalysisStoredRow): number | null {
  for (const value of [row.percent, row.unit, row.basis, row.label]) {
    const match = String(value ?? '').match(/(-?[\d,]+(?:\.\d+)?)\s*%/)
    if (!match) continue
    return numberFromText(match[1])
  }
  return null
}

function joinDistinctText(...values: string[]): string {
  return values
    .map((value) => value.trim())
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .join(' ')
}

function mergeCalculationAbstractRows(rows: RateAnalysisStoredRow[]): RateAnalysisStoredRow[] {
  const merged: RateAnalysisStoredRow[] = []

  for (const source of rows) {
    const row = { ...source }
    const previous = merged.at(-1)
    if (!row.label.trim() && previous) {
      const previousText = rowText(previous)
      const percent = percentageFromRow(row)
      if (percent !== null && /profit|overhead|add/.test(previousText)) {
        previous.percent = joinDistinctText(previous.percent, row.percent)
        previous.basis = joinDistinctText(previous.basis, row.basis)
        if (!previous.amount) previous.amount = row.amount
        continue
      }
      if (isTotalCostRow(previousText)) {
        previous.basis = joinDistinctText(previous.basis, row.basis)
        previous.unit = joinDistinctText(previous.unit, row.unit)
        if (!previous.amount) previous.amount = row.amount
        continue
      }
    }
    merged.push(row)
  }

  return merged
}

function calculationAbstractRows(recipe: RateAnalysisRecipe): RateAnalysisStoredRow[] {
  if (recipe.storedValues?.abstract.length) return recipe.storedValues.abstract
  return [
    { label: 'A. Cost of Materials', value: '', unit: '', basis: '', percent: '', amount: '' },
    { label: 'B. Hire charges of Machinery', value: '', unit: '', basis: '', percent: '', amount: '' },
    { label: 'C. Cost of Labour', value: '', unit: '', basis: '', percent: '', amount: '' },
    { label: 'Total', value: '', unit: 'Total', basis: '', percent: '', amount: '' },
    {
      label: "D. Add for contractor's profit and overheads",
      value: '',
      unit: '',
      basis: '',
      percent: `${formatCalculated(recipe.overheadPercent)}%`,
      amount: ''
    },
    { label: 'Total cost for', value: '', unit: recipe.unit, basis: String(recipe.outputQuantity), percent: '', amount: '' },
    { label: `Rate per ${recipe.unit || 'unit'}`, value: '', unit: '', basis: '', percent: '', amount: '' }
  ]
}

function choosePercentageBasis(
  text: string,
  recorded: number | null,
  percent: number,
  sections: Record<RateAnalysisSectionKey, number>,
  subtotal: number,
  current: number
): { name: string; value: number } {
  if (/profit|overhead/.test(text)) return { name: 'current total', value: current }
  if (/transport/.test(text)) return { name: 'materials', value: sections.materials }

  const candidates = [
    { name: 'current total', value: current },
    { name: 'A + B + C', value: subtotal },
    { name: 'materials', value: sections.materials },
    { name: 'machinery', value: sections.machinery },
    { name: 'labour', value: sections.labour },
    { name: 'machinery + labour', value: sections.machinery + sections.labour },
    {
      name: '75% excluding materials',
      value: (sections.machinery + sections.labour) * 0.75
    }
  ]
  if (recorded !== null && percent !== 0) {
    return candidates.reduce((closest, candidate) =>
      Math.abs(roundMoney((candidate.value * percent) / 100) - recorded) <
      Math.abs(roundMoney((closest.value * percent) / 100) - recorded)
        ? candidate
        : closest
    )
  }
  if (text.includes('excluding cost of materials')) return candidates.at(-1)!
  return candidates[0]
}

function calculationDenominator(
  row: RateAnalysisStoredRow,
  totalCostRow: RateAnalysisStoredRow | null,
  fallback: number
): number | null {
  for (const value of [row.basis, totalCostRow?.basis, totalCostRow?.unit, fallback]) {
    const denominator = numberFromText(value)
    if (denominator !== null && denominator !== 0) return denominator
  }
  return null
}

function roundTo(value: number, increment: number): number {
  return Math.round((value + Number.EPSILON) / increment) * increment
}

function roundToPrintedGrid(rawRate: number, recorded: number | null): number {
  if (recorded === null) return roundMoney(rawRate)
  for (const increment of [1, 0.1, 0.01, 0.001]) {
    const rounded = roundTo(rawRate, increment)
    if (Math.abs(rounded - recorded) < 0.000001) return rounded
  }
  return roundMoney(rawRate)
}

function sectionForSor(category: string): RateAnalysisSectionKey {
  if (category === 'machinery') return 'machinery'
  if (category === 'labour') return 'labour'
  return 'materials'
}

function resourceCode(line: JsonRecord, table: string): string {
  const codeColumn = RATE_TABLE_CODE_COLUMNS[table]
  return codeColumn ? textValue(line[codeColumn]) : ''
}

function getRateSource(line: JsonRecord): string {
  const direct = textValue(line.rate_source)
  if (direct && direct !== 'formula') return direct
  const formula = line.rate_formula as JsonRecord | undefined
  return formula ? textValue(formula.source) : ''
}

function parseSorRef(value: unknown): SorRef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const ref = value as JsonRecord
  const table = textValue(ref.table)
  if (table !== 'labour_rate' && table !== 'machinery_rate') return null
  const code = textValue(ref.code)
  if (!code) return null
  return {
    table,
    code,
    component: textValue(ref.component) || undefined
  }
}

function sorRefKey(ref: SorRef): string {
  return `${ref.table}:${ref.code}`
}

function findSourceSorRef(row: JsonRecord, sourceRows: JsonRecord[], index: number): SorRef | null {
  const direct = parseSorRef(row.sor_ref)
  if (direct) return direct
  const byIndex = parseSorRef(sourceRows[index]?.sor_ref)
  if (byIndex) return byIndex

  const sl = textValue(row.sl, textValue(row.sl_no)).trim()
  const desc = textValue(row.desc, textValue(row.description)).trim().toLowerCase()
  const matched = sourceRows.find((source) => {
    const sourceSl = textValue(source.sl, textValue(source.sl_no)).trim()
    const sourceDesc = textValue(source.desc, textValue(source.description)).trim().toLowerCase()
    return (sl && sourceSl === sl) || (desc && sourceDesc === desc)
  })
  return parseSorRef(matched?.sor_ref)
}

function collectSorRefs(...sections: Array<unknown>): SorRef[] {
  const refs = new Map<string, SorRef>()
  for (const section of sections) {
    for (const row of jsonRows(section)) {
      const ref = parseSorRef(row.sor_ref)
      if (ref) refs.set(sorRefKey(ref), ref)
    }
  }
  return Array.from(refs.values())
}

async function fetchSorRefRateRows(refs: SorRef[], year: string): Promise<Map<string, JsonRecord>> {
  const requests = new Map<SorRef['table'], Set<string>>()
  for (const ref of refs) {
    const codes = requests.get(ref.table) ?? new Set<string>()
    codes.add(ref.code)
    requests.set(ref.table, codes)
  }

  const result = new Map<string, JsonRecord>()
  await Promise.all(
    Array.from(requests.entries()).map(async ([table, codes]) => {
      const codeCol = RATE_TABLE_CODE_COLUMNS[table]
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('sor_year', year)
        .in(codeCol, Array.from(codes))
      if (error) return
      for (const row of (data ?? []) as JsonRecord[]) {
        result.set(`${table}:${textValue(row[codeCol])}`, row)
      }
    })
  )
  return result
}

function zoneRateValue(value: unknown, zone: SorZone): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return (value as JsonRecord)[zone]
}

function resolveSorInputRate(ref: SorRef | null, row: JsonRecord | undefined, zone: SorZone): number | null {
  if (!ref || !row) return null

  if (ref.table === 'labour_rate') {
    const zoned = numberValue(zoneRateValue(row.zone_rates, zone), Number.NaN)
    if (Number.isFinite(zoned)) return zoned
    const fallback = numberValue(row.rate, Number.NaN)
    return Number.isFinite(fallback) ? fallback : null
  }

  if (ref.table === 'machinery_rate') {
    const zoned = zoneRateValue(row.zone_rates, zone)
    if (zoned && typeof zoned === 'object' && !Array.isArray(zoned)) {
      const componentRate = numberValue((zoned as JsonRecord)[ref.component ?? ''], Number.NaN)
      if (Number.isFinite(componentRate)) return componentRate
    }
    const fallback = numberValue(row[ref.component ?? ''], Number.NaN)
    return Number.isFinite(fallback) ? fallback : null
  }

  return null
}

function zoneLabel(zone: SorZone): string {
  if (zone === 'zone_1') return 'Zone I'
  if (zone === 'zone_2') return 'Zone II'
  return 'Zone III'
}

function correctionFor(
  corrected: JsonRecord | null,
  section: RateAnalysisSectionKey,
  description: string
): JsonRecord | null {
  const sectionCorrections = corrected?.[section]
  if (!sectionCorrections || typeof sectionCorrections !== 'object') return null
  const value = (sectionCorrections as JsonRecord)[description]
  return value && typeof value === 'object' ? (value as JsonRecord) : null
}

async function fetchCorrected(
  category: string,
  code: string,
  year: string
): Promise<JsonRecord | null> {
  const table = `${category}_corrected`
  const quotedCode = `"${code.replaceAll('"', '""')}"`
  let response = await supabase.from(table).select(`year,${quotedCode}`).eq('year', year).maybeSingle()
  if (response.error) {
    response = await supabase.from(table).select('*').eq('year', year).maybeSingle()
  }
  if (response.error || !response.data) return null
  const value = (response.data as unknown as JsonRecord)[code]
  return value && typeof value === 'object' ? (value as JsonRecord) : null
}

async function fetchRateRows(
  rawSections: Record<RateAnalysisSectionKey, JsonRecord[]>,
  year: string
): Promise<Map<string, JsonRecord>> {
  const requests = new Map<string, Set<string>>()

  const addRequest = (table: string, code: string): void => {
    if (!table || !code || !RATE_TABLE_CODE_COLUMNS[table]) return
    const codes = requests.get(table) ?? new Set<string>()
    codes.add(code)
    requests.set(table, codes)
  }

  for (const lines of Object.values(rawSections)) {
    for (const line of lines) {
      const source = getRateSource(line)
      const table = source.split('.')[0]
      addRequest(table, resourceCode(line, table))

      const formula = line.rate_formula as JsonRecord | undefined
      const formulaCodes = Array.isArray(formula?.codes) ? formula.codes : []
      for (const code of formulaCodes) addRequest('material_rate', textValue(code))

      const operands = Array.isArray(formula?.operands) ? formula.operands : []
      for (const operand of operands) {
        if (!operand || typeof operand !== 'object') continue
        const item = operand as JsonRecord
        addRequest(textValue(item.table), textValue(item.code))
      }
    }
  }

  const result = new Map<string, JsonRecord>()
  await Promise.all(
    Array.from(requests.entries()).map(async ([table, codes]) => {
      const codeCol = RATE_TABLE_CODE_COLUMNS[table]
      const sourceCategory = table.replace('_rates', '')
      const yearCol = table.endsWith('_rates') && SSR_CATEGORIES.has(sourceCategory)
        ? 'year'
        : 'sor_year'
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq(yearCol, year)
        .in(codeCol, Array.from(codes))
      if (error) return
      for (const row of (data ?? []) as JsonRecord[]) {
        result.set(`${table}:${textValue(row[codeCol])}`, row)
      }
    })
  )
  return result
}

function directRate(line: JsonRecord, rates: Map<string, JsonRecord>): number | null {
  const source = getRateSource(line)
  const [table, field] = source.split('.')
  if (!table || !field) return null
  const code = resourceCode(line, table)
  const row = rates.get(`${table}:${code}`)
  if (!row) return null
  const value = numberValue(row[field], Number.NaN)
  return Number.isFinite(value) ? value : null
}

function formulaRate(
  line: JsonRecord,
  rates: Map<string, JsonRecord>,
  previousLine: RateAnalysisLine | null
): { rate: number; amount?: number } | null {
  const formula = line.rate_formula as JsonRecord | undefined
  if (!formula) return null
  const type = textValue(formula.type)

  if (type === 'site_available_zero_rate' || type === 'display_zero_group_header') {
    return { rate: 0, amount: numberValue(formula.amount) }
  }
  if (type === 'display_section_subtotal') return { rate: 0, amount: 0 }
  if (type === 'percent_of_previous_line_amount') {
    const amount = roundMoney(
      (numberValue(previousLine?.amount) * numberValue(formula.percent)) / 100
    )
    const quantity = numberValue(line.quantity, 1) || 1
    return { rate: roundMoney(amount / quantity), amount }
  }
  if (type === 'ref') {
    const codes = Array.isArray(formula.codes)
      ? formula.codes.map((value) => textValue(value))
      : []
    const rate = codes.reduce(
      (total, code) => total + numberValue(rates.get(`material_rate:${code}`)?.rate),
      0
    )
    return { rate }
  }
  if (type === 'item_rate_delta') {
    const operands = Array.isArray(formula.operands) ? formula.operands : []
    let rate = 0
    for (const operand of operands) {
      if (!operand || typeof operand !== 'object') continue
      const value = operand as JsonRecord
      const table = textValue(value.table)
      const code = textValue(value.code)
      const field = textValue(value.field, 'rate')
      const operandRate = numberValue(rates.get(`${table}:${code}`)?.[field])
      rate = textValue(value.op) === 'subtract' ? rate - operandRate : rate + operandRate
    }
    return { rate }
  }

  const base = directRate(line, rates)
  if (base == null) return null
  if (type === 'material_use_rate') {
    return {
      rate:
        (base * numberValue(formula.count, 1) * numberValue(formula.length_m, 1)) /
        (numberValue(formula.divisor_hours, 1) || 1)
    }
  }
  if (type === 'accessory_use_rate' || type === 'unit_conversion') {
    return { rate: base / (numberValue(formula.divisor, 1) || 1) }
  }
  return null
}

function buildSectionLines(
  section: RateAnalysisSectionKey,
  rawLines: JsonRecord[],
  rates: Map<string, JsonRecord>,
  corrected: JsonRecord | null
): { lines: RateAnalysisLine[]; unresolved: number } {
  let unresolved = 0
  const lines: RateAnalysisLine[] = []
  const sorted = [...rawLines].sort(
    (a, b) => numberValue(a.display_order) - numberValue(b.display_order)
  )

  for (const [index, raw] of sorted.entries()) {
    const description = textValue(raw.description, 'Unnamed item')
    const quantity = numberValue(raw.quantity)
    const formula = formulaRate(raw, rates, lines.at(-1) ?? null)
    const direct = directRate(raw, rates)
    const resolved = formula ?? (direct == null ? null : { rate: direct })
    const correction = correctionFor(corrected, section, description)
    const correctedRate = numberValue(correction?.printed_rate, Number.NaN)
    const baseRate = resolved?.rate ?? numberValue(raw.rate, 0)
    const rate = Number.isFinite(correctedRate) ? correctedRate : roundMoney(baseRate)
    const calculationQuantity = numberValue(raw.calculation_quantity, Number.NaN)
    const amount =
      resolved?.amount ??
      roundMoney(
        Number.isFinite(calculationQuantity) && formula
          ? calculationQuantity * baseRate
          : quantity * rate
      )
    if (!resolved && !Number.isFinite(correctedRate) && quantity !== 0) unresolved += 1

    const source = getRateSource(raw)
    const table = source.split('.')[0]
    lines.push({
      id: `${section}-${textValue(raw.display_order, String(index))}-${index}`,
      slNo: textValue(raw.sl_no),
      description,
      unit: textValue(raw.unit),
      quantity,
      rate: roundMoney(rate),
      amount,
      resourceCode: resourceCode(raw, table) || undefined,
      rateSource: source || textValue((raw.rate_formula as JsonRecord | undefined)?.type) || undefined
    })
  }

  return { lines, unresolved }
}

async function fetchOverheadPercent(year: string): Promise<number> {
  const { data } = await supabase
    .from('sor_constant')
    .select('value_num')
    .eq('sor_year', year)
    .eq('code', 'OVERHEAD_PROFIT_PCT')
    .maybeSingle()
  return numberValue((data as JsonRecord | null)?.value_num, 13.615)
}

function jsonRows(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is JsonRecord => !!row && typeof row === 'object' && !Array.isArray(row)
      )
    : []
}

function storedSsrLines(
  section: RateAnalysisSectionKey,
  value: unknown,
  sourceValue: unknown,
  annualRates: Map<string, JsonRecord>,
  year: string,
  zone: SorZone
): { lines: RateAnalysisLine[]; unresolved: number } {
  let unresolved = 0
  const sourceRows = jsonRows(sourceValue)
  const lines = jsonRows(value).map((row, index) => {
    const quantity = numberValue(row.quantity)
    const parsedRate = numberValue(row.rate, Number.NaN)
    const parsedAmount = numberValue(row.amount, Number.NaN)
    const ref = findSourceSorRef(row, sourceRows, index)
    const annualRow = ref ? annualRates.get(sorRefKey(ref)) : undefined
    const linkedRate = resolveSorInputRate(ref, annualRow, zone)
    const hasRate = Number.isFinite(parsedRate)
    const effectiveRate = linkedRate ?? (hasRate ? parsedRate : Number.NaN)
    const hasEffectiveRate = Number.isFinite(effectiveRate)
    const amount =
      linkedRate !== null
        ? roundMoney(quantity * linkedRate)
        : Number.isFinite(parsedAmount)
          ? parsedAmount
          : hasEffectiveRate
            ? roundMoney(quantity * effectiveRate)
            : Number.NaN
    const hasAmount = Number.isFinite(amount)
    if (quantity !== 0 && !hasEffectiveRate && !hasAmount) unresolved += 1
    return {
      id: `${section}-${textValue(row.sl, textValue(row.sl_no, String(index + 1)))}-${index}`,
      slNo: textValue(row.sl, textValue(row.sl_no)),
      description: textValue(row.desc, textValue(row.description)),
      unit: textValue(row.unit),
      quantity,
      rate: hasEffectiveRate ? effectiveRate : 0,
      amount: hasAmount ? amount : 0,
      sourceValues: {
        quantity: textValue(row.quantity),
        rate: textValue(row.rate),
        amount: textValue(row.amount)
      },
      sorRef: ref ?? undefined,
      linkedRate:
        ref && linkedRate !== null
          ? {
              rate: linkedRate,
              year,
              zone,
              source: textValue(annualRow?.source)
            }
          : undefined,
      resourceCode: ref?.code,
      rateSource: ref
        ? `${ref.table}.${ref.component ?? (ref.table === 'labour_rate' ? 'rate' : '')}`
        : undefined
    }
  })
  return { lines, unresolved }
}

function storedRows(value: unknown): RateAnalysisStoredRow[] {
  return jsonRows(value).map((row) => ({
    label: textValue(row.label),
    value: textValue(row.value),
    unit: textValue(row.unit),
    basis: textValue(row.basis),
    percent: textValue(row.percent),
    amount: textValue(row.amount),
    userAdded: Boolean(row.userAdded),
    amountOverride: Boolean(row.amountOverride)
  }))
}

function storedSectionTotal(rows: RateAnalysisStoredRow[], prefix: 'A.' | 'B.' | 'C.'): string {
  return rows.find((row) => row.label.trim().toUpperCase().startsWith(prefix))?.amount ?? ''
}

function storedLineTotal(lines: RateAnalysisLine[]): string {
  const values = lines
    .map((line) => Number.isFinite(line.amount) ? line.amount : Number(line.sourceValues?.amount))
    .filter(Number.isFinite)
  if (!values.length) return ''
  return values.reduce((total, value) => total + value, 0).toFixed(2)
}

function labourTotalWithAreaAllowance(
  labourLines: RateAnalysisLine[],
  percent: number | undefined
): { labourTotal: string; allowanceAmount: number } {
  const base = numberValue(storedLineTotal(labourLines))
  const pct = numberValue(percent)
  const allowanceAmount = pct > 0 ? roundMoney((base * pct) / 100) : 0
  return {
    labourTotal: (base + allowanceAmount).toFixed(2),
    allowanceAmount
  }
}

function labourRowsWithAreaAllowance(
  rows: RateAnalysisStoredRow[],
  label: string | undefined,
  percent: number | undefined,
  amount: number
): RateAnalysisStoredRow[] {
  const pct = numberValue(percent)
  if (pct <= 0 || amount <= 0) return rows
  return [
    ...rows,
    {
      label: label || 'Area allowance on labour component',
      value: '',
      unit: '',
      basis: 'Labour component only',
      percent: `${pct}%`,
      amount: amount.toFixed(2)
    }
  ]
}

function percentValue(value: unknown): number | null {
  const match = textValue(value).match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function storedOverheadPercent(yearRow: JsonRecord, fallback: number): number {
  for (const field of ['labour_extract', 'abstract']) {
    for (const row of jsonRows(yearRow[field])) {
      const label = `${textValue(row.label)} ${textValue(row.note)}`.toLowerCase()
      if (!label.includes('contractor') && !label.includes('overhead')) continue
      const percent = percentValue(row.percent) ?? percentValue(row.unit)
      if (percent !== null) return percent
    }
  }
  return fallback
}

function storedDescriptionRuns(value: unknown): RateAnalysisTextRun[] {
  return jsonRows(value).map((run) => ({
    text: textValue(run.text),
    bold: Boolean(run.bold),
    italic: Boolean(run.italic),
    underline: Boolean(run.underline)
  }))
}

function lastNumericValue(value: unknown): number {
  const values = jsonRows(value)
    .map((row) => numberValue(row.value, Number.NaN))
    .filter(Number.isFinite)
  return values.at(-1) ?? Number.NaN
}

function storedPublishedRate(yearRow: JsonRecord): number {
  const baseRate = numberValue(yearRow.base_rate, Number.NaN)
  if (Number.isFinite(baseRate)) return baseRate
  const firstRate = jsonRows(yearRow.rate_values)[0]
  return numberValue(firstRate?.value, Number.NaN)
}

async function fetchSsrRecipe(
  node: ProjectNode,
  year: string,
  options: RateAnalysisFetchOptions = {}
): Promise<RateAnalysisRecipe> {
  const code = node.itemCode ?? node.name
  const zone = options.zone ?? DEFAULT_ZONE
  const [
    { data: source, error: sourceError },
    { data: storedYear, error: yearError },
    defaultOverheadPercent
  ] = await Promise.all([
    fetchSsrItemSource(code),
    supabase
      .from(SSR_YEAR_TABLE)
      .select('rates,totals,labour_extract,abstract,base_rate,rate_values,modifiers')
      .eq('code', code)
      .eq('year', year)
      .maybeSingle(),
    fetchOverheadPercent(year)
  ])

  if (sourceError || !source) {
    throw new Error(sourceError?.message || `SSR item not found for ${code}`)
  }
  if (yearError || !storedYear) {
    throw new Error(yearError?.message || `SSR recipe not found for ${code} in ${year}`)
  }
  const row = source as unknown as JsonRecord
  const yearRow = storedYear as unknown as JsonRecord
  const storedRates =
    yearRow.rates && typeof yearRow.rates === 'object' && !Array.isArray(yearRow.rates)
      ? (yearRow.rates as JsonRecord)
      : {}
  const annualRates = await fetchSorRefRateRows(
    collectSorRefs(
      storedRates.materials,
      storedRates.machinery,
      storedRates.labour,
      row.materials,
      row.machinery,
      row.labour
    ),
    year
  )
  let unresolvedLines = 0
  const sections = (Object.keys(SECTION_LABELS) as RateAnalysisSectionKey[]).map((key) => {
    const built = storedSsrLines(
      key,
      storedRates[key] ?? row[key],
      row[key],
      annualRates,
      year,
      zone
    )
    unresolvedLines += built.unresolved
    return { key, label: SECTION_LABELS[key], lines: built.lines }
  })
  const description = textValue(row.description, node.itemDescription ?? node.name)
  const layout = parseRateAnalysisVisibility(undefined, description)
  const descriptionRuns = storedDescriptionRuns(row.description_runs)
  if (descriptionRuns.length) layout.descriptionRuns = descriptionRuns
  const abstractRows = storedRows(yearRow.abstract)
  const labourAllowance = labourTotalWithAreaAllowance(
    sections[2].lines,
    options.areaAllowancePercent
  )
  const labourExtract = labourRowsWithAreaAllowance(
    storedRows(yearRow.labour_extract),
    options.areaAllowanceLabel,
    options.areaAllowancePercent,
    labourAllowance.allowanceAmount
  )

  return {
    schemaVersion: 1,
    itemKey: projectItemKey(node),
    itemSource: 'SSR',
    categoryKey: SSR_ITEM_TABLE,
    itemCode: code,
    documentTitle: `${SSR_DOCUMENT_TITLES[textValue(row.subject)] ?? textValue(row.subject)}- ${year}`,
    description,
    unit: textValue(row.unit, node.unit ?? ''),
    outputQuantity: numberValue(row.quantity, 1) || 1,
    year,
    zone,
    areaAllowancePercent: options.areaAllowancePercent,
    areaAllowanceLabel: options.areaAllowanceLabel,
    overheadPercent: storedOverheadPercent(yearRow, defaultOverheadPercent),
    sections,
    layout,
    storedValues: {
      sectionTotals: {
        materials: storedLineTotal(sections[0].lines) || storedSectionTotal(abstractRows, 'A.'),
        machinery: storedLineTotal(sections[1].lines) || storedSectionTotal(abstractRows, 'B.'),
        labour: labourAllowance.labourTotal || storedLineTotal(sections[2].lines)
      },
      labourExtract,
      abstract: abstractRows
    },
    publishedRate: storedPublishedRate(yearRow),
    publishedLabourComponent: lastNumericValue(yearRow.labour_extract),
    leadApplicability: withLeadPolicy(row.lead_applicability, row.lead_policy),
    seigniorageApplicability: parseSeigniorageApplicability(row.seigniorage_applicability),
    unresolvedLines
  }
}

function withLeadPolicy(leadApplicability: unknown, leadPolicy: unknown): unknown {
  if (!leadPolicy) return leadApplicability
  const base =
    leadApplicability && typeof leadApplicability === 'object' && !Array.isArray(leadApplicability)
      ? (leadApplicability as JsonRecord)
      : {}
  return { ...base, lead_policy: leadPolicy }
}

function parseSeigniorageApplicability(
  raw: unknown
): RateAnalysisRecipe['seigniorageApplicability'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as JsonRecord
  const materialRows = jsonRows(obj.rows).length > 0 ? jsonRows(obj.rows) : jsonRows(obj.materials)
  const materials = materialRows
    .map((row) => {
      const mode = textValue(row.mode, 'RECIPE_MATERIAL_RATIO')
      const quantityRatio = numberValue(row.quantity_ratio, Number.NaN)
      const recipeMaterialQty = numberValue(row.recipe_material_qty, Number.NaN)
      // FULL_ITEM_QUANTITY: no ratio or recipe qty required
      if (mode === 'FULL_ITEM_QUANTITY') {
        return buildSeigRow(row, mode, Number.isFinite(quantityRatio) ? quantityRatio : 1, recipeMaterialQty)
      }
      // DIRECT_RECIPE_QTY: needs recipe_material_qty
      if (mode === 'DIRECT_RECIPE_QTY') {
        if (!Number.isFinite(recipeMaterialQty)) return null
        return buildSeigRow(row, mode, quantityRatio, recipeMaterialQty)
      }
      // RECIPE_MATERIAL_RATIO: needs both
      if (!Number.isFinite(quantityRatio) || !Number.isFinite(recipeMaterialQty)) return null
      return buildSeigRow(row, mode, quantityRatio, recipeMaterialQty)
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  return {
    schema_version: numberValue(obj.schema_version, Number.NaN) || undefined,
    source: typeof obj.source === 'string' ? obj.source : null,
    applicable: obj.applicable === true || obj.applicable === false ? Boolean(obj.applicable) : undefined,
    rows: materials,
    materials,
    seig_code: typeof obj.seig_code === 'string' ? obj.seig_code : null,
    rate_override: typeof obj.rate_override === 'number' && Number.isFinite(obj.rate_override)
      ? obj.rate_override
      : null,
    notes: typeof obj.notes === 'string' ? obj.notes : null,
    generated_at: typeof obj.generated_at === 'string' ? obj.generated_at : null,
    reason: typeof obj.reason === 'string' ? obj.reason : null,
    policy_basis: typeof obj.policy_basis === 'object' && obj.policy_basis ? obj.policy_basis as Record<string, unknown> : null
  }
}

function buildSeigRow(
  row: JsonRecord,
  mode: string,
  quantityRatio: number,
  recipeMaterialQty: number
): SeigniorageMaterialPolicy {
  const qtyUnit = textValue(row.charge_unit, '') || textValue(row.quantity_unit, '') || textValue(row.recipe_material_unit, '')
  const matDesc = textValue(row.material_desc, '') || textValue(row.recipe_material_desc, '')
  const materialKey = textValue(row.material_key)
  const quantityBasis = textValue(row.quantity_basis)
  const normalizedQuantityBasis =
    quantityBasis === 'ITEM_QTY' ||
    quantityBasis === 'ITEM_QTY_X_RATIO' ||
    quantityBasis === 'RECIPE_MATERIAL_QTY'
      ? quantityBasis
      : null
  return {
    material_key: materialKey || undefined,
    material_label: textValue(row.material_label, ''),
    material_desc: matDesc,
    recipe_material_desc: matDesc,
    recipe_material_unit: textValue(row.recipe_material_unit),
    recipe_material_qty: Number.isFinite(recipeMaterialQty) ? recipeMaterialQty : null,
    quantity_ratio: Number.isFinite(quantityRatio) ? quantityRatio : null,
    seig_code: typeof row.seig_code === 'string' ? row.seig_code : null,
    charge_unit: qtyUnit || null,
    quantity_unit: qtyUnit || undefined,
    conversion_factor: numberOrNull(row.conversion_factor) ?? 1,
    quantity_basis: normalizedQuantityBasis,
    mode: mode as SeigniorageMaterialPolicy['mode'],
    item_unit: typeof row.item_unit === 'string' ? row.item_unit : null,
    material_code: typeof row.material_code === 'string' ? row.material_code : null,
    status: typeof row.status === 'string' ? row.status : null,
    notes: typeof row.notes === 'string' ? row.notes : null
  }
}

async function fetchSsrItemSource(code: string) {
  const withPolicy = await supabase
    .from(SSR_ITEM_TABLE)
    .select(
      'code,subject,chapter,description,description_runs,unit,quantity,materials,machinery,labour,rate_structure,lead_applicability,lead_policy,seigniorage_applicability'
    )
    .eq('code', code)
    .maybeSingle()

  if (!withPolicy.error || !/lead_policy/i.test(withPolicy.error.message)) return withPolicy

  return supabase
    .from(SSR_ITEM_TABLE)
    .select(
      'code,subject,chapter,description,description_runs,unit,quantity,materials,machinery,labour,rate_structure,lead_applicability,seigniorage_applicability'
    )
    .eq('code', code)
    .maybeSingle()
}

async function fetchSorRecipe(
  node: ProjectNode,
  year: string,
  options: RateAnalysisFetchOptions = {}
): Promise<RateAnalysisRecipe> {
  const category = node.categoryKey ?? ''
  const config = SOR_CONFIG[category]
  if (!config) throw new Error(`Rate analysis is unavailable for ${category || 'this item'}`)
  const code = node.itemCode ?? node.name
  const zone = options.zone ?? DEFAULT_ZONE
  const [{ data: source, error }, { data: rateRow }, overheadPercent] = await Promise.all([
    supabase.from(category).select('*').eq(config.codeCol, code).maybeSingle(),
    supabase
      .from(config.rateTable)
      .select('*')
      .eq(config.codeCol, code)
      .eq('sor_year', year)
      .maybeSingle(),
    fetchOverheadPercent(year)
  ])
  if (error || !source) throw new Error(error?.message || `Item not found for ${code}`)
  const item = source as JsonRecord
  const rates = rateRow as JsonRecord | null
  const rate =
    category === 'labour'
      ? resolveSorInputRate({ table: 'labour_rate', code }, rates ?? undefined, zone) ?? 0
      : config.rateFields
          .map((field) => numberValue(rates?.[field], Number.NaN))
          .find(Number.isFinite) ?? 0
  const sectionKey = sectionForSor(category)
  const sections = (Object.keys(SECTION_LABELS) as RateAnalysisSectionKey[]).map((key) => ({
    key,
    label: SECTION_LABELS[key],
    lines:
      key === sectionKey
        ? [
            {
              id: `${key}-0`,
              slNo: '1',
              description: textValue(item[config.nameCol], node.itemDescription ?? node.name),
              unit: textValue(item.unit, node.unit ?? ''),
              quantity: 1,
              rate: roundMoney(rate),
              amount: roundMoney(rate),
              resourceCode: code,
              rateSource: `${config.rateTable}.${config.rateFields[0]}`,
              linkedRate:
                category === 'labour'
                  ? {
                      rate,
                      year,
                      zone,
                      source: textValue(rates?.source)
                    }
                  : undefined
            }
          ]
        : []
  }))

  return {
    schemaVersion: 1,
    itemKey: projectItemKey(node),
    itemSource: node.itemSource ?? 'SOR',
    categoryKey: category,
    itemCode: code,
    description: textValue(item[config.nameCol], node.itemDescription ?? node.name),
    unit: textValue(item.unit, node.unit ?? ''),
    outputQuantity: 1,
    year,
    zone,
    areaAllowancePercent: options.areaAllowancePercent,
    areaAllowanceLabel: options.areaAllowanceLabel,
    overheadPercent,
    sections,
    layout: parseRateAnalysisVisibility(item.visibility, textValue(item[config.nameCol])),
    publishedRate: rate,
    unresolvedLines: rate ? 0 : 1
  }
}

export async function fetchRateAnalysis(
  node: ProjectNode,
  year: string,
  options: RateAnalysisFetchOptions = {}
): Promise<RateAnalysisRecipe> {
  if (!node.itemCode || !node.categoryKey || node.itemSource === 'OTHERS') {
    throw new Error('Custom items do not have a Supabase recipe yet.')
  }
  const recipe =
    node.itemSource === 'SSR' ||
    node.categoryKey === SSR_ITEM_TABLE ||
    SSR_CATEGORIES.has(node.categoryKey)
      ? await fetchSsrRecipe(node, year, options)
      : await fetchSorRecipe(node, year, options)
  return cloneRecipe(recipe)
}

/**
 * Fetch just the published rate-per-unit for an item from Supabase data.
 * Returns null for custom items or when the rate can't be resolved.
 */
export async function fetchItemRate(
  node: ProjectNode,
  year: string,
  options: RateAnalysisFetchOptions = {}
): Promise<number | null> {
  if (!node.itemCode || !node.categoryKey || node.itemSource === 'OTHERS') return null
  try {
    const recipe = await fetchRateAnalysis(node, year, options)
    const usesLinkedInputs = recipe.sections.some((section) =>
      section.lines.some((line) => Boolean(line.linkedRate))
    )
    if (usesLinkedInputs || numberValue(recipe.areaAllowancePercent) > 0) {
      const r = calculateRateAnalysis(recipe).ratePerUnit
      return Number.isFinite(r) ? r : null
    }
    if (typeof recipe.publishedRate === 'number' && Number.isFinite(recipe.publishedRate)) {
      return recipe.publishedRate
    }
    const r = calculateRateAnalysis(recipe).ratePerUnit
    return Number.isFinite(r) ? r : null
  } catch {
    return null
  }
}
