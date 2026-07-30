import { supabase } from './supabase'
import type { EestimateProject, ProjectNode } from '../types/project'
import type {
  RateAnalysisRecipe,
  RateAnalysisSectionKey,
  SeigniorageApplicabilityPolicy,
  SeigniorageMaterialPolicy
} from '../types/rateAnalysis'
import { projectItemKey, rateAnalysisOverrideForNode } from './projectItems'
import { readFinalValueFromSnapshot } from './finalNumber'

export interface SeigniorageCharge {
  seig_code: string
  mineral_name: string
  rate_per_mt: number | null
  rate_per_m3: number | null
  schedule: string | null
  go_reference: string | null
  effective_from: string | null
  confidence: string | null
  notes: string | null
}

let chargesCache: Promise<SeigniorageCharge[]> | null = null

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text || null
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value)
}

function jsonRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          !!row && typeof row === 'object' && !Array.isArray(row)
      )
    : []
}

export async function fetchSeigniorageCharges(): Promise<SeigniorageCharge[]> {
  if (!chargesCache) {
    chargesCache = (async () => {
      const { data, error } = await supabase
        .from('seigniorage_charge')
        .select(
          'seig_code, mineral_name, rate_per_mt, rate_per_m3, schedule, go_reference, effective_from, confidence, notes'
        )
        .order('mineral_name', { ascending: true })

      if (error) throw error

      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        seig_code: String(row.seig_code ?? ''),
        mineral_name: String(row.mineral_name ?? ''),
        rate_per_mt: numberOrNull(row.rate_per_mt),
        rate_per_m3: numberOrNull(row.rate_per_m3),
        schedule: textOrNull(row.schedule),
        go_reference: textOrNull(row.go_reference),
        effective_from: textOrNull(row.effective_from),
        confidence: textOrNull(row.confidence),
        notes: textOrNull(row.notes)
      }))
    })().catch((error) => {
      chargesCache = null
      throw error
    })
  }

  return chargesCache
}

export function seigniorageRateLabel(charge: SeigniorageCharge): string {
  const mt = charge.rate_per_mt !== null ? `Rs. ${charge.rate_per_mt.toFixed(2)} / MT` : ''
  const m3 = charge.rate_per_m3 !== null ? `Rs. ${charge.rate_per_m3.toFixed(2)} / m3` : ''
  return [mt, m3].filter(Boolean).join(' | ') || 'Rate not specified'
}

const SSR_ITEM_CODE_RE = /\b(?:IRR|COM)-[A-Z]+-\d+(?:-\d+)?\b/i

function resolveSsrItemCode(item: ProjectNode): string {
  const explicit = item.itemCode?.trim()
  if (explicit) return explicit
  return item.name.match(SSR_ITEM_CODE_RE)?.[0] ?? item.name
}

export function projectSeigniorageItemCodes(project: EestimateProject | null): string[] {
  if (!project) return []
  const codes = new Set<string>()
  for (const item of collectAllItems(project.root)) {
    const explicit = item.itemCode?.trim()
    const embedded = item.name.match(SSR_ITEM_CODE_RE)?.[0]
    const candidates = Array.from(new Set([explicit, embedded].filter(Boolean)))
    for (const code of candidates) {
      if (
        code &&
        (item.itemSource === 'SSR' ||
          item.categoryKey === 'ssr_item' ||
          item.categoryKey === 'SSR' ||
          /^(?:IRR|COM)-[A-Z]+-\d/i.test(code))
      ) {
        codes.add(code)
      }
    }
  }
  return Array.from(codes).sort()
}

export async function fetchSeignioragePolicies(
  codes: string[]
): Promise<Record<string, SeigniorageApplicabilityPolicy>> {
  const unique = Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)))
  const policies: Record<string, SeigniorageApplicabilityPolicy> = {}
  for (let index = 0; index < unique.length; index += 100) {
    const batch = unique.slice(index, index + 100)
    const { data, error } = await supabase
      .from('ssr_item')
      .select('code,seigniorage_applicability')
      .in('code', batch)
    if (error) throw error
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const code = textValue(row.code)
      const policy = parseSeignioragePolicy(row.seigniorage_applicability)
      if (code && policy) policies[code] = policy
    }
  }
  return policies
}

export function parseSeignioragePolicy(raw: unknown): SeigniorageApplicabilityPolicy | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  // v3 uses "rows", v2 used "materials"
  const rawRows = jsonRows(obj.rows).length > 0 ? jsonRows(obj.rows) : jsonRows(obj.materials)
  const materials = rawRows
    .map((row) => {
      const mode = textValue(row.mode, 'RECIPE_MATERIAL_RATIO')
      const quantityRatio = numberValue(row.quantity_ratio, Number.NaN)
      const recipeMaterialQty = numberValue(row.recipe_material_qty, Number.NaN)
      // FULL_ITEM_QUANTITY: no ratio or recipe qty needed
      if (mode === 'FULL_ITEM_QUANTITY') {
        // ratio defaults to 1 for full-item mode
        const ratio = Number.isFinite(quantityRatio) ? quantityRatio : 1
        return buildPolicyRow(row, mode, ratio, recipeMaterialQty)
      }
      // DIRECT_RECIPE_QTY: needs recipe_material_qty
      if (mode === 'DIRECT_RECIPE_QTY') {
        if (!Number.isFinite(recipeMaterialQty)) return null
        return buildPolicyRow(row, mode, quantityRatio, recipeMaterialQty)
      }
      if (mode === 'ADDON_MATERIAL_RATIO') {
        if (!Number.isFinite(quantityRatio)) return null
        return buildPolicyRow(row, mode, quantityRatio, recipeMaterialQty)
      }
      // RECIPE_MATERIAL_RATIO: needs both
      if (!Number.isFinite(quantityRatio) || !Number.isFinite(recipeMaterialQty)) {
        return null
      }
      return buildPolicyRow(row, mode, quantityRatio, recipeMaterialQty)
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
  const addons = jsonRows(obj.addons).flatMap((group) => {
    const addonId = textValue(group.addon_id).trim()
    if (!addonId) return []
    const addonRows = jsonRows(group.rows)
      .map((row) => {
        const ratio = numberValue(row.quantity_ratio, Number.NaN)
        if (!Number.isFinite(ratio)) return null
        return buildPolicyRow(row, textValue(row.mode, 'ADDON_MATERIAL_RATIO'), ratio, Number.NaN)
      })
      .filter((row): row is SeigniorageMaterialPolicy => row !== null)
    return [{ addon_id: addonId, applicable: group.applicable === true, rows: addonRows }]
  })
  return {
    schema_version: numberValue(obj.schema_version, Number.NaN) || undefined,
    source: typeof obj.source === 'string' ? obj.source : null,
    applicable: obj.applicable === true || obj.applicable === false ? Boolean(obj.applicable) : undefined,
    rows: materials,
    materials,
    addons,
    seig_code: typeof obj.seig_code === 'string' ? obj.seig_code : null,
    rate_override:
      typeof obj.rate_override === 'number' && Number.isFinite(obj.rate_override)
        ? obj.rate_override
        : null,
    notes: typeof obj.notes === 'string' ? obj.notes : null,
    generated_at: typeof obj.generated_at === 'string' ? obj.generated_at : null,
    reason: typeof obj.reason === 'string' ? obj.reason : null,
    policy_basis: typeof obj.policy_basis === 'object' && obj.policy_basis ? obj.policy_basis as Record<string, unknown> : null
  }
}

function buildPolicyRow(
  row: Record<string, unknown>,
  mode: string,
  quantityRatio: number,
  recipeMaterialQty: number
): SeigniorageMaterialPolicy {
  const qtyUnit = textValue(row.charge_unit, '') || textValue(row.quantity_unit, '') || textValue(row.recipe_material_unit, '')
  const matDesc = textValue(row.material_desc, '') || textValue(row.recipe_material_desc, '')
  const quantityBasis =
    row.quantity_basis === 'ITEM_QTY' ||
    row.quantity_basis === 'ITEM_QTY_X_RATIO' ||
    row.quantity_basis === 'RECIPE_MATERIAL_QTY'
      ? row.quantity_basis
      : null
  return {
    material_key: textValue(row.material_key),
    material_label: textValue(row.material_label, ''),
    material_desc: matDesc,
    recipe_material_desc: matDesc,
    recipe_material_unit: textValue(row.recipe_material_unit),
    recipe_material_qty: Number.isFinite(recipeMaterialQty) ? recipeMaterialQty : null,
    quantity_ratio: Number.isFinite(quantityRatio) ? quantityRatio : null,
    seig_code: typeof row.seig_code === 'string' ? row.seig_code : null,
    charge_unit: qtyUnit || null,
    quantity_unit: qtyUnit || undefined,
    conversion_factor: numberOrNull(row.conversion_factor),
    conversion_required: row.conversion_required === true,
    quantity_basis: quantityBasis,
    mode: mode as SeigniorageMaterialPolicy['mode'],
    item_unit: typeof row.item_unit === 'string' ? row.item_unit : null,
    material_code: typeof row.material_code === 'string' ? row.material_code : null,
    status: typeof row.status === 'string' ? row.status : null,
    notes: typeof row.notes === 'string' ? row.notes : null
  }
}

// ---------------------------------------------------------------------------
// Seigniorage Calculation — Item-level (estimate-style table)
// ---------------------------------------------------------------------------

/** DMFT = District Mineral Foundation Trust (30% of seigniorage). */
const DMFT_PERCENT = 30
/** SMFT = Some other levy (2% of seigniorage). */
const SMFT_PERCENT = 2

/**
 * Permit fee on seigniorage, per the G.O. of 31.03.2022 (w.e.f. 01.04.2022):
 * 0.8 times the seigniorage fee for all minor minerals, and 0.4 times for
 * Colour Granite and Black Granite. The GO excludes Ordinary Sand.
 *
 * The rule is fixed by the GO, so it is applied automatically with no
 * project-level configuration.
 */
export const DEFAULT_PERMIT_MULTIPLIER = 0.8

export const GO_PERMIT_MULTIPLIERS: Record<string, number> = {
  SEIG_BLACK_GRANITE_BELOW: 0.4,
  SEIG_BLACK_GRANITE_GANGSAW: 0.4,
  SEIG_COLOUR_GRANITE_BELOW: 0.4,
  SEIG_COLOUR_GRANITE_GANGSAW: 0.4,
  SEIG_ORDINARY_SAND: 0
}

export const PERMIT_GO_REFERENCE = 'G.O. dt. 31.03.2022, w.e.f. 01.04.2022'

/** Permit multiplier for a mineral, straight from the GO. */
export function permitMultiplierFor(seigCode: string | null): number {
  const fromGo = seigCode ? GO_PERMIT_MULTIPLIERS[seigCode] : undefined
  return fromGo ?? DEFAULT_PERMIT_MULTIPLIER
}

/** The GO multiplier expressed as the percentage shown in tables and prints. */
export function permitPercentFor(seigCode: string | null): number {
  return permitMultiplierFor(seigCode) * 100
}

function permitForRow(seigCode: string | null, seigniorage: number | null): number | null {
  if (seigniorage == null) return null
  return seigniorage * permitMultiplierFor(seigCode)
}

/** One row in the seigniorage table per item code and effective mineral rate. */
export interface SeigniorageItemRow {
  id: string
  slNo: number
  itemNodeId: string
  itemCode: string
  description: string
  unit: string
  /** Computed applicable quantity (after mode-based calculation). */
  quantity: number | null
  /** Original DATA quantity (entered by user in spreadsheet). */
  itemQuantity?: number | null
  /** Original DATA unit. */
  itemUnit?: string
  /** v3 mode: FULL_ITEM_QUANTITY | RECIPE_MATERIAL_RATIO | DIRECT_RECIPE_QTY */
  mode?: string | null
  /** v3 quantity_basis: ITEM_QTY | ITEM_QTY_X_RATIO | RECIPE_MATERIAL_QTY */
  quantityBasis?: string | null
  materialLabel?: string
  materialKey?: string
  recipeMaterialDesc?: string
  recipeMaterialQty?: number | null
  recipeMaterialUnit?: string | null
  quantityRatio?: number | null
  conversionFactor?: number | null
  conversionRequired?: boolean
  status?: string | null
  policyNotes?: string | null
  charge: SeigniorageCharge | null
  autoMatched: boolean
  seigRate: number | null
  seigniorage: number | null
  dmft: number | null
  smft: number | null
  /** Mineral transit permit fee for this row. */
  permit: number | null
  /** GO permit rate applied to this row, as a percentage of seigniorage. */
  permitPercent: number
  isManual: boolean
}

export interface SeigniorageCalculation {
  rows: SeigniorageItemRow[]
  totalSeigniorage: number
  totalDmft: number
  totalSmft: number
  totalPermit: number
  grandTotal: number
  /** Rounded versions. */
  roundedSeigniorage: number
  roundedDmft: number
  roundedSmft: number
  roundedPermit: number
  roundedGrandTotal: number
}

// ---- Material → Seigniorage matching ----

const MT_KEYWORDS = [
  'steel', 'cement', 'iron', 'bitumen', 'reinforcement', 'bar', 'rod',
  'g.i.', 'gi ', 'm.s.', 'ms ', 'aluminium', 'lead', 'zinc', 'copper',
  'wire', 'nail', 'bolt', 'nut', 'screw', 'washer', 'clamp', 'kg',
  'tonne', 'metric ton', 'mt', 'quintal'
]

const M3_KEYWORDS = [
  'sand', 'aggregate', 'stone', 'gravel', 'earth', 'soil', 'moorum',
  'murum', 'boulder', 'rubble', 'metal', 'ballast', 'grit', 'cubic',
  'cum', 'm3', 'm³'
]

function guessRateUnit(materialDesc: string, materialUnit: string): 'MT' | 'm3' | null {
  const lower = materialDesc.toLowerCase()
  const unitLower = materialUnit.toLowerCase()
  if (unitLower === 'mt' || unitLower === 'tonne' || unitLower === 'kg' || unitLower === 'quintal') return 'MT'
  if (unitLower === 'cum' || unitLower === 'm3' || unitLower === 'm³') return 'm3'
  const mtScore = MT_KEYWORDS.filter((kw) => lower.includes(kw)).length
  const m3Score = M3_KEYWORDS.filter((kw) => lower.includes(kw)).length
  if (mtScore > m3Score) return 'MT'
  if (m3Score > mtScore) return 'm3'
  return null
}

export function matchMaterialToSeigniorage(
  materialDesc: string,
  materialCode: string,
  charges: SeigniorageCharge[]
): SeigniorageCharge | null {
  const desc = materialDesc.toLowerCase().trim()
  const code = materialCode.toLowerCase().trim()

  if (code) {
    const byCode = charges.find((c) => c.seig_code.toLowerCase() === code)
    if (byCode) return byCode
  }
  const byName = charges.find((c) => c.mineral_name.toLowerCase() === desc)
  if (byName) return byName
  const byContains = charges.find((c) => {
    const mineral = c.mineral_name.toLowerCase()
    return mineral.includes(desc) || desc.includes(mineral)
  })
  if (byContains) return byContains

  const descWords = new Set(desc.split(/[\s,/()-]+/).filter((w) => w.length > 2))
  let bestScore = 0
  let bestMatch: SeigniorageCharge | null = null
  for (const c of charges) {
    const mineralWords = c.mineral_name.toLowerCase().split(/[\s,/()-]+/).filter((w) => w.length > 2)
    const overlap = mineralWords.filter((w) => descWords.has(w)).length
    if (overlap > bestScore) { bestScore = overlap; bestMatch = c }
  }
  if (bestScore >= 2 && bestMatch) return bestMatch
  return null
}

function collectAllItems(root: ProjectNode): ProjectNode[] {
  const items: ProjectNode[] = []
  const walk = (node: ProjectNode): void => {
    if (node.kind === 'item') { items.push(node); return }
    node.children.forEach(walk)
  }
  walk(root)
  return items
}

/** Round to nearest integer (rupee). */
function roundRupee(n: number): number {
  return Math.round(n)
}

function roundQuantity(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000
}

function roundRatio(n: number): number {
  return Math.round((n + Number.EPSILON) * 100000000) / 100000000
}

function rateForMaterialPolicy(
  policy: SeigniorageMaterialPolicy,
  charge: SeigniorageCharge | null
): number | null {
  if (!charge) return null
  // v3: charge_unit, v2: quantity_unit
  const unit = (policy.charge_unit || policy.quantity_unit || '').toLowerCase()
  if ((unit === 'cum' || unit === 'm3' || unit === 'm³') && charge.rate_per_m3 !== null) {
    return charge.rate_per_m3
  }
  if ((unit === 'mt' || unit === 'tonne' || unit === 'ton') && charge.rate_per_mt !== null) {
    return charge.rate_per_mt
  }
  return charge.rate_per_m3 ?? charge.rate_per_mt
}

/**
 * Compute seigniorage for every item in the project.
 *
 * - Tries to auto-match a seigniorage charge from the item's rate analysis
 *   recipe materials.
 * - Falls back to a stored override (assignedSeigniorage in the project file).
 * - Computes DMFT (30%) and SMFT (2%).
 */
/** Compute applicable quantity based on v3 mode. */
function computeApplicableQty(
  enteredQty: number | null,
  policy: SeigniorageMaterialPolicy
): number | null {
  const mode = policy.mode
  if (mode === 'FULL_ITEM_QUANTITY') return enteredQty
  if (mode === 'DIRECT_RECIPE_QTY') return policy.recipe_material_qty ?? null
  // RECIPE_MATERIAL_RATIO (default)
  if (enteredQty == null || policy.quantity_ratio == null) return null
  if (policy.conversion_required && policy.conversion_factor == null) return null
  const cf = policy.conversion_factor ?? 1
  // Ratio quantities are rounded only after every occurrence of the item code
  // and every material carrying the same charge have been combined.
  return enteredQty * policy.quantity_ratio * cf
}

function normalizedMaterialText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')
}

/**
 * A selected optional addition carries its own complete DATA analysis. Use the
 * material quantity and output basis published in that DATA block directly:
 *
 *   project item quantity × (add-on material quantity / add-on output quantity)
 *
 * This is already the billable material quantity. It must not be blocked by a
 * second conversion flag inherited from a mineral-rate unit.
 */
function addonPolicyFromData(
  recipe: RateAnalysisRecipe | null | undefined,
  policy: SeigniorageMaterialPolicy
): SeigniorageMaterialPolicy {
  if (policy.mode !== 'ADDON_MATERIAL_RATIO') return policy
  const analysis = recipe?.dataVariant?.additionAnalysis
  if (!analysis || !Number.isFinite(analysis.outputQuantity) || analysis.outputQuantity <= 0) {
    return policy
  }

  const materialLines =
    analysis.sections.find((section) => section.key === 'materials')?.lines.filter(
      (line) => Number.isFinite(line.quantity) && line.quantity > 0
    ) ?? []
  if (!materialLines.length) return policy

  const policyDescription = normalizedMaterialText(
    policy.material_desc || policy.recipe_material_desc || policy.material_label
  )
  const policyCode = policy.material_code?.trim().toUpperCase()
  const materialLine =
    materialLines.find(
      (line) => policyCode && line.resourceCode?.trim().toUpperCase() === policyCode
    ) ??
    materialLines.find((line) => {
      const lineDescription = normalizedMaterialText(line.description)
      return (
        policyDescription &&
        (lineDescription === policyDescription ||
          lineDescription.includes(policyDescription) ||
          policyDescription.includes(lineDescription))
      )
    }) ??
    (materialLines.length === 1 ? materialLines[0] : undefined)
  if (!materialLine) return policy

  const materialUnit = materialLine.unit.trim() || policy.recipe_material_unit || ''
  return {
    ...policy,
    material_desc: materialLine.description,
    recipe_material_desc: materialLine.description,
    recipe_material_qty: materialLine.quantity,
    recipe_material_unit: materialUnit,
    quantity_ratio: materialLine.quantity / analysis.outputQuantity,
    charge_unit: materialUnit || policy.charge_unit,
    quantity_unit: materialUnit || policy.quantity_unit,
    conversion_factor: 1,
    conversion_required: false,
    quantity_basis: 'ITEM_QTY_X_RATIO',
    notes: `Selected add-on DATA: ${materialLine.quantity} ${materialUnit || 'units'} per ${analysis.outputQuantity} ${analysis.unit}.`
  }
}

function normalizedItemCode(code: string): string {
  return code.trim().toUpperCase()
}

function ratioMode(mode: string | null | undefined): boolean {
  return mode === 'RECIPE_MATERIAL_RATIO' || mode === 'ADDON_MATERIAL_RATIO'
}

function rowCombinationKey(row: SeigniorageItemRow): string {
  const materialCharge =
    row.charge?.seig_code || row.materialKey || row.materialLabel || 'UNASSIGNED'
  const mode = ratioMode(row.mode) ? 'MATERIAL_RATIO' : row.mode || 'ITEM_QUANTITY'
  const conversionFactor = ratioMode(row.mode) ? row.conversionFactor ?? 1 : null
  return [
    normalizedItemCode(row.itemCode),
    materialCharge.trim().toUpperCase(),
    row.seigRate == null ? 'NO_RATE' : String(row.seigRate),
    row.unit.trim().toUpperCase(),
    (row.itemUnit || '').trim().toUpperCase(),
    mode,
    conversionFactor == null ? '' : String(conversionFactor),
    row.conversionRequired ? 'CONVERSION_REQUIRED' : '',
    row.status || '',
    String(row.permitPercent)
  ].join('|')
}

/**
 * Produce one display/calculation row for one item code and one effective
 * mineral rate. Project occurrences contribute to the code total once, while
 * recipe materials carrying the same charge contribute their quantities and
 * ratios to the same row.
 */
function combineProjectRows(
  rows: SeigniorageItemRow[]
): SeigniorageItemRow[] {
  const groups = new Map<string, SeigniorageItemRow[]>()
  for (const row of rows) {
    const key = rowCombinationKey(row)
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }

  return Array.from(groups.entries()).map(([key, group]) => {
    const first = group[0]
    // Count each contributing project occurrence once. Base DATA rows normally
    // include every occurrence of the code; selected add-on rows include only
    // the occurrences on which that add-on is active.
    const contributingItems = new Map<string, number>()
    for (const row of group) {
      if (row.itemQuantity != null && !contributingItems.has(row.itemNodeId)) {
        contributingItems.set(row.itemNodeId, row.itemQuantity)
      }
    }
    const totalItemQuantity = contributingItems.size
      ? Array.from(contributingItems.values()).reduce((sum, quantity) => sum + quantity, 0)
      : null
    const rawApplicableQuantities = group
      .map((row) => row.quantity)
      .filter((quantity): quantity is number => quantity != null)
    const rawApplicableQuantity = rawApplicableQuantities.length
      ? rawApplicableQuantities.reduce((sum, quantity) => sum + quantity, 0)
      : null
    const combinedQuantity =
      rawApplicableQuantity != null && ratioMode(first.mode)
        ? roundQuantity(rawApplicableQuantity)
        : rawApplicableQuantity
    const conversionFactor = first.conversionFactor ?? 1
    const combinedRatio =
      ratioMode(first.mode) &&
      rawApplicableQuantity != null &&
      totalItemQuantity != null &&
      totalItemQuantity !== 0 &&
      conversionFactor !== 0
        ? roundRatio(rawApplicableQuantity / totalItemQuantity / conversionFactor)
        : first.quantityRatio

    const materialDescriptions = Array.from(
      new Set(group.map((row) => row.recipeMaterialDesc?.trim()).filter(Boolean))
    )
    const materialLabels = Array.from(
      new Set(group.map((row) => row.materialLabel?.trim()).filter(Boolean))
    )
    const materialKeys = Array.from(
      new Set(group.map((row) => row.materialKey?.trim()).filter(Boolean))
    )
    const directRecipeQuantities = group
      .map((row) => row.recipeMaterialQty)
      .filter((quantity): quantity is number => quantity != null)
    const recipeMaterialQty =
      first.mode === 'DIRECT_RECIPE_QTY' && directRecipeQuantities.length
        ? directRecipeQuantities.reduce((sum, quantity) => sum + quantity, 0)
        : group.length === 1
          ? first.recipeMaterialQty
          : null
    const materialLabel =
      materialLabels.length === 1
        ? materialLabels[0]
        : first.charge?.mineral_name || first.materialLabel
    const materialKey =
      materialKeys.length === 1
        ? materialKeys[0]
        : first.charge?.seig_code || first.materialKey
    const recipeMaterialDesc =
      materialDescriptions.length === 1 ? materialDescriptions[0] : undefined
    const seigniorage =
      combinedQuantity != null && first.seigRate != null
        ? combinedQuantity * first.seigRate
        : null
    const dmft = seigniorage != null ? seigniorage * (DMFT_PERCENT / 100) : null
    const smft = seigniorage != null ? seigniorage * (SMFT_PERCENT / 100) : null

    return {
      ...first,
      id: `combined:${key}`,
      itemQuantity: totalItemQuantity ?? first.itemQuantity,
      quantity: combinedQuantity,
      quantityRatio: combinedRatio,
      materialLabel,
      materialKey,
      recipeMaterialDesc,
      recipeMaterialQty,
      seigniorage,
      dmft,
      smft,
      permit: permitForRow(first.charge?.seig_code ?? null, seigniorage)
    }
  })
}

export function computeSeigniorageTable(
  project: EestimateProject | null,
  charges: SeigniorageCharge[],
  manualRows: SeigniorageItemRow[] = [],
  policyByCode: Record<string, SeigniorageApplicabilityPolicy> = {}
): SeigniorageCalculation {
  if (!project) {
    return emptyCalc(manualRows)
  }

  const items = collectAllItems(project.root).map((item) => ({
    item,
    itemCode: resolveSsrItemCode(item),
    quantity: readFinalValueFromSnapshot(item)
  }))
  const storedOverrides = project.seigniorageOverrides ?? {}
  const rows: SeigniorageItemRow[] = []

  for (const itemContext of items) {
    const { item, itemCode, quantity: qty } = itemContext
    const itemKey = projectItemKey(item)
    const savedRecipe = rateAnalysisOverrideForNode(project, item)
    const compiledRecipe = project.dashboardSnapshot?.recipes?.[item.id]
    const recipe = savedRecipe ?? compiledRecipe
    const addonDataRecipe = recipe?.dataVariant?.additionAnalysis ? recipe : compiledRecipe ?? recipe
    // Supabase is the policy authority. Saved/compiled recipes may contain a
    // snapshot from an older policy version, so use that only as an offline
    // fallback when the live SSR policy is unavailable.
    const dbSeig = policyByCode[itemCode] ?? recipe?.seigniorageApplicability

    const selectedAddonId = recipe?.dataVariant?.addonId ?? item.dataVariant?.addonId
    const addonPolicies = selectedAddonId
      ? dbSeig?.addons
          ?.filter((group) => group.applicable && group.addon_id === selectedAddonId)
          .flatMap((group) => group.rows) ?? []
      : []
    if (dbSeig?.applicable === false && addonPolicies.length === 0) continue

    const basePolicies = dbSeig?.applicable === false
      ? []
      : dbSeig?.rows?.length
        ? dbSeig.rows
        : dbSeig?.materials ?? []
    const policies = [...basePolicies, ...addonPolicies]
    if (policies?.length) {
      for (const configuredPolicy of policies) {
        const policy = addonPolicyFromData(addonDataRecipe, configuredPolicy)
        const charge = policy.seig_code
          ? charges.find((c) => c.seig_code === policy.seig_code) ?? null
          : null
        const seigRate = rateForMaterialPolicy(policy, charge)
        const seigQty = computeApplicableQty(qty, policy)
        const seigniorage = seigQty != null && seigRate != null ? seigQty * seigRate : null
        const dmft = seigniorage != null ? seigniorage * (DMFT_PERCENT / 100) : null
        const smft = seigniorage != null ? seigniorage * (SMFT_PERCENT / 100) : null
        const qtyUnit = policy.charge_unit || policy.quantity_unit || policy.recipe_material_unit || item.unit || recipe?.unit || 'cum'
        const matDesc = policy.material_desc || policy.recipe_material_desc || ''
        const matLabel = policy.material_label || charge?.mineral_name || 'Material'

        rows.push({
          id: `${item.id}:${policy.material_key || ''}:${matDesc}:${policy.seig_code ?? 'review'}`,
          slNo: 0,
          itemNodeId: item.id,
          itemCode,
          description: item.itemDescription ?? item.name,
          unit: qtyUnit,
          quantity: seigQty,
          itemQuantity: qty,
          itemUnit: item.unit ?? recipe?.unit ?? '',
          mode: policy.mode,
          quantityBasis: policy.quantity_basis,
          materialLabel: matLabel,
          materialKey: policy.material_key,
          recipeMaterialDesc: matDesc,
          recipeMaterialQty: policy.recipe_material_qty,
          recipeMaterialUnit: policy.recipe_material_unit,
          quantityRatio: policy.quantity_ratio,
          conversionFactor: policy.conversion_factor,
          conversionRequired: Boolean(
            policy.conversion_required && policy.conversion_factor == null
          ),
          status: policy.status,
          policyNotes: policy.notes,
          charge,
          autoMatched: true,
          seigRate,
          seigniorage,
          dmft,
          smft,
          permit: permitForRow(policy.seig_code ?? null, seigniorage),
          permitPercent: permitPercentFor(policy.seig_code ?? null),
          isManual: false
        })
      }
      continue
    }

    // Priority for finding seigniorage:
    // 1. DB-sourced seigniorage_applicability on the SSR item (from Supabase).
    // 2. Project-level override (stored in .eestimate file).
    // 3. Auto-match from recipe material descriptions.
    let charge: SeigniorageCharge | null = null
    let autoMatched = false

    // 1. DB-sourced seigniorage applicability.
    if (dbSeig && dbSeig.seig_code) {
      charge = charges.find((c) => c.seig_code === dbSeig.seig_code) ?? null
      if (charge) autoMatched = true
    }

    // 2. Project-level override.
    const override = storedOverrides[itemKey]
    if (override) {
      if (override.seigCode === null) {
        charge = null
        autoMatched = false
      } else {
        charge = charges.find((c) => c.seig_code === override.seigCode) ?? charge
      }
      if (override.rate != null) {
        // Use manual rate even if charge also matched.
      }
    }

    // 3. Fallback: auto-match from recipe materials.
    if (!charge && recipe) {
      const matSection = recipe.sections.find((s) => s.key === 'materials' as RateAnalysisSectionKey)
      if (matSection) {
        for (const line of matSection.lines) {
          const desc = line.description.trim()
          const code = line.resourceCode?.trim() || ''
          if (!desc || line.quantity <= 0) continue
          if (/^[A-Z]\d/i.test(desc) && desc.length <= 6) continue
          charge = matchMaterialToSeigniorage(desc, code, charges)
          if (charge) { autoMatched = true; break }
        }
      }
    }

    // Determine effective rate.
    let seigRate: number | null = null
    // DB-sourced rate override takes highest priority.
    if (dbSeig?.rate_override != null) {
      seigRate = dbSeig.rate_override
    }
    // Project-level override.
    if (override?.rate != null) seigRate = override.rate
    // From matched charge.
    if (seigRate === null && charge) {
      const unit = item.unit ?? recipe?.unit ?? ''
      const rateUnit = guessRateUnit(charge.mineral_name, unit)
      if (rateUnit === 'MT' && charge.rate_per_mt !== null) {
        seigRate = charge.rate_per_mt
      } else if (rateUnit === 'm3' && charge.rate_per_m3 !== null) {
        seigRate = charge.rate_per_m3
      } else {
        seigRate = charge.rate_per_m3 ?? charge.rate_per_mt
      }
    }
    // Manual override rate takes priority.
    if (override?.rate != null) seigRate = override.rate

    if (!charge && seigRate === null) continue

    const seigniorage = qty != null && seigRate != null ? qty * seigRate : null
    const dmft = seigniorage != null ? seigniorage * (DMFT_PERCENT / 100) : null
    const smft = seigniorage != null ? seigniorage * (SMFT_PERCENT / 100) : null

    rows.push({
      id: item.id,
      slNo: 0,
      itemNodeId: item.id,
      itemCode,
      description: item.itemDescription ?? item.name,
      unit: item.unit ?? recipe?.unit ?? 'cum',
      quantity: qty,
      itemQuantity: qty,
      itemUnit: item.unit ?? recipe?.unit ?? '',
      materialLabel: charge?.mineral_name ?? 'Unassigned',
      charge,
      autoMatched,
      seigRate,
      seigniorage,
      dmft,
      smft,
      permit: permitForRow(charge?.seig_code ?? null, seigniorage),
      permitPercent: permitPercentFor(charge?.seig_code ?? null),
      isManual: false
    })
  }

  const combinedRows = combineProjectRows(rows)

  // Append manual rows. They are user-authored entries, not project-code
  // quantities, and therefore remain independent.
  for (const mr of manualRows) {
    combinedRows.push({ ...mr })
  }

  return finalizeCalc(combinedRows)
}

function emptyCalc(manualRows: SeigniorageItemRow[]): SeigniorageCalculation {
  return finalizeCalc(manualRows)
}

function finalizeCalc(rows: SeigniorageItemRow[]): SeigniorageCalculation {
  // Assign serial numbers.
  let sl = 1
  for (const r of rows) { r.slNo = sl++ }

  const totalSeigniorage = rows.reduce((s, r) => s + (r.seigniorage ?? 0), 0)
  const totalDmft = rows.reduce((s, r) => s + (r.dmft ?? 0), 0)
  const totalSmft = rows.reduce((s, r) => s + (r.smft ?? 0), 0)
  const totalPermit = rows.reduce((s, r) => s + (r.permit ?? 0), 0)
  const grandTotal = totalSeigniorage + totalDmft + totalSmft + totalPermit

  return {
    rows,
    totalSeigniorage,
    totalDmft,
    totalSmft,
    totalPermit,
    grandTotal,
    roundedSeigniorage: roundRupee(totalSeigniorage),
    roundedDmft: roundRupee(totalDmft),
    roundedSmft: roundRupee(totalSmft),
    roundedPermit: roundRupee(totalPermit),
    roundedGrandTotal: roundRupee(grandTotal)
  }
}

/**
 * Seigniorage override stored per item in the project file.
 * null seigCode = explicitly "no seigniorage".
 */
export interface SeigniorageOverride {
  seigCode: string | null
  /** Manual rate override (Rs per unit). */
  rate?: number | null
}
