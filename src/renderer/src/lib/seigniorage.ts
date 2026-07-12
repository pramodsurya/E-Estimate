import { supabase } from './supabase'
import type { EestimateProject, ProjectNode } from '../types/project'
import type {
  RateAnalysisSectionKey,
  SeigniorageApplicabilityPolicy,
  SeigniorageMaterialPolicy
} from '../types/rateAnalysis'
import { projectItemKey } from './projectItems'
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
      // RECIPE_MATERIAL_RATIO: needs both
      if (!Number.isFinite(quantityRatio) || !Number.isFinite(recipeMaterialQty)) {
        return null
      }
      return buildPolicyRow(row, mode, quantityRatio, recipeMaterialQty)
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
  return {
    schema_version: numberValue(obj.schema_version, Number.NaN) || undefined,
    source: typeof obj.source === 'string' ? obj.source : null,
    applicable: obj.applicable === true || obj.applicable === false ? Boolean(obj.applicable) : undefined,
    rows: materials,
    materials,
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
    conversion_factor: numberOrNull(row.conversion_factor) ?? 1,
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

/** One row in the seigniorage calculation table — one per project item. */
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
  status?: string | null
  policyNotes?: string | null
  charge: SeigniorageCharge | null
  autoMatched: boolean
  seigRate: number | null
  seigniorage: number | null
  dmft: number | null
  smft: number | null
  isManual: boolean
}

export interface SeigniorageCalculation {
  rows: SeigniorageItemRow[]
  totalSeigniorage: number
  totalDmft: number
  totalSmft: number
  grandTotal: number
  /** Rounded versions. */
  roundedSeigniorage: number
  roundedDmft: number
  roundedSmft: number
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
  const cf = policy.conversion_factor ?? 1
  return roundQuantity(enteredQty * policy.quantity_ratio * cf)
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

  const items = collectAllItems(project.root)
  const storedOverrides = project.seigniorageOverrides ?? {}
  const rows: SeigniorageItemRow[] = []

  for (const item of items) {
    const itemKey = projectItemKey(item)
    const recipe = project.rateAnalysisOverrides?.[itemKey]
    const qty = readFinalValueFromSnapshot(item)
    const itemCode = resolveSsrItemCode(item)
    const dbSeig = recipe?.seigniorageApplicability ?? policyByCode[itemCode]

    if (dbSeig?.applicable === false) continue

    const policies = dbSeig?.rows?.length ? dbSeig.rows : dbSeig?.materials
    if (policies?.length) {
      for (const policy of policies) {
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
          status: policy.status,
          policyNotes: policy.notes,
          charge,
          autoMatched: true,
          seigRate,
          seigniorage,
          dmft,
          smft,
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
      isManual: false
    })
  }

  // Append manual rows.
  for (const mr of manualRows) {
    rows.push({ ...mr })
  }

  return finalizeCalc(rows)
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
  const grandTotal = totalSeigniorage + totalDmft + totalSmft

  return {
    rows,
    totalSeigniorage,
    totalDmft,
    totalSmft,
    grandTotal,
    roundedSeigniorage: roundRupee(totalSeigniorage),
    roundedDmft: roundRupee(totalDmft),
    roundedSmft: roundRupee(totalSmft),
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
