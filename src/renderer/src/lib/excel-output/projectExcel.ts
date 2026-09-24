/**
 * Project-dashboard Excel payload (native rust_xlsxwriter path — no ExcelJS).
 *
 * One workbook pulls every statement together the way the Typst project book
 * (`collectProjectTypstParts`) orders them. This builder owns only the project
 * tabs (General Abstract, per-component Abstract + Detailed, and explicit
 * Page nodes). The native writer reuses the established Cover, Lead,
 * Seigniorage, and DATA writers rather than recreating those layouts here.
 *
 * Formula rule (fail-loud, no silent values): every COMPUTED cell is a live
 * Excel formula. The only static numbers are declared source inputs, each
 * recorded in `payload.inputs` with a reason (seigniorage policy rates,
 * SOR published rates, lead km/base rates, percents, static quantities with
 * no detail cell, miscellaneous costs). Anything numeric and static that is
 * NOT in `inputs` is a builder bug — pinned by test-project-no-direct-values.
 *
 * Reference directions (cell-acyclic by construction, pinned by
 * test-project-acyclic):
 *   detail qty cells -> Abstract qty -> Seigniorage qty cells
 *   Lead application amounts -> DATA adopted rate -> Abstract rate
 *   Abstract amount = qty * rate (same row); component TOTAL = SUM(amounts)
 *   General Abstract -> component TOTALs + Seigniorage grand + charge maths
 *   Cover -> General Abstract grand total (nothing references Cover back)
 *
 * Template-owned sheets can also be included without recreating them here.
 * Bund and Guide Wall generated items explicitly reference their special
 * sheets' recorded total cells; custom items still reference the normal
 * Detailed sheet. The dashboard wires those refs; this module resolves them.
 */
import {
  buildComponentDetailedSheet,
  type ComponentDetailSheet,
  type DetailedItemHeader
} from './componentExcel'
import { columnLabel, sanitizeSheetName, type DetailGrid } from './detailGrid'
import { buildGeneralAbstractExcelSheet, type GeneralAbstractExcelRow } from './generalAbstractExcel'
import type { ProjectAbstract } from '../projectAbstract'
import type { SignatureFooterRow } from '../../types/project'
import { appendSignatureRows } from './excelSignature'
import type { ExcelPrintSettings } from './excelDocumentSettings'

/** Cell address inside one project sheet (0-based, rebased per sheet). */
export interface ProjectCellRef {
  sheet: string
  r: number
  c: number
}

/** One declared source input: a static number the formulas may consume. */
export interface ProjectInputCell extends ProjectCellRef {
  reason: string
}

export interface ProjectSheetPayload {
  name: string
  grid: DetailGrid
  landscape?: boolean
  printSettings?: ExcelPrintSettings
}

export interface ProjectDashboardPayload {
  sheets: ProjectSheetPayload[]
  /** Cells whose formulas are resolved by the native combined-workbook writer. */
  links: ProjectFormulaLink[]
  /** Allowlist of every static numeric cell, with reasons. */
  inputs: ProjectInputCell[]
  /** Formula terms injected into the reused Seigniorage template. */
  seigniorageLinks: ProjectSeigniorageLink[]
  /** General Abstract grand-total cell consumed by the reused Front Page. */
  coverCostRef: string
}

export interface ProjectFormulaLink extends ProjectCellRef {
  kind: 'data-rate' | 'seigniorage' | 'dmf' | 'smet' | 'permit'
  key: string
}

export interface ProjectSeigniorageTermLink {
  formula: string
  leadVariantId?: string
}

export interface ProjectSeigniorageLink {
  key: string
  workQtyFormula?: string
  terms: ProjectSeigniorageTermLink[]
}

/** One dashboard item: quantity lives in a detail cell or a static seed. */
export interface ProjectItemInput {
  key: string
  component: string
  code: string
  name: string
  unit: string
  description: string
  /** Adopted quantity when no detail cell exists (recorded input). */
  staticQty?: number | null
  /** Custom calculated items must retain a live Detailed quantity reference. */
  requiresDetailQuantity?: boolean
  /**
   * Explicit live quantity cell (e.g. a template block total on another
   * sheet). Overrides the component Detailed derivation when present.
   */
  detailRef?: ProjectCellRef | null
  /** Recipe key on the DATA sheet that prices this item. */
  dataKey: string
}

/** One DATA recipe row: the base rate is a published/adopted (direct) input. */
export interface ProjectDataInput {
  key: string
  code: string
  description: string
  unit: string
  /** Base rate before lead adders (direct input); null renders as text. */
  sorRate?: number | null
  /** True for manual (non-DATA) rates: changes the audit reason only. */
  manualRate?: boolean
  sorRateText?: string
  /** Output quantity the recipe prices (direct input seed cell). */
  outputQty?: number | null
  /** Lead rows whose amounts add into this recipe's adopted rate. */
  leadKeys?: string[]
}

/**
 * One lead row per recipe application (material per DATA output). Quantities
 * and gross rates are estimator source inputs; the amount scales to the
 * estimate through the DATA adder (amount / outputQty) and the item rate.
 */
export interface ProjectLeadInput {
  key: string
  label: string
  unit: string
  /** Recipe key whose DATA row absorbs this application. */
  recipeKey: string
  /** Material quantity per DATA output unit (direct input). */
  qtyPerOutput?: number | null
  /** Gross lead rate per unit (direct input). */
  grossRate?: number | null
  /** Lead distance in km (direct input, informational). */
  km?: number | null
}

/** One seigniorage row: policy rate is the direct input. */
export interface ProjectSeigInput {
  key: string
  description: string
  unit: string
  terms?: Array<{
    itemKey?: string
    factor?: number
    staticQty?: number
    leadVariantId?: string
  }>
  /** Legacy fixture/import compatibility; new project wiring always emits terms. */
  itemKey?: string
  staticQty?: number | null
  qtyFactor?: number | null
  policyRate?: number | null
  /** Transit-permit percent of the charge (direct input); null = no permit. */
  permitPercent?: number | null
}

export interface ProjectComponentInput {
  name: string
  signatures?: SignatureFooterRow[]
  printSettings?: ExcelPrintSettings
  code?: string
  itemKeys: string[]
  headers: DetailedItemHeader[]
  details: Array<ComponentDetailSheet | null>
  /** Template-owned sheets (for example the calculated Guide Wall layout). */
  templateSheets?: ProjectSheetPayload[]
  /** Explicit page nodes directly under this component/sub-component. */
  pages?: ProjectSheetPayload[]
  /** Sub-component names, emitted as S- roll-up rows into this Abstract. */
  subs?: string[]
}

export interface ProjectChargeInput {
  kind: 'seigniorage' | 'dmf' | 'smet' | 'nac' | 'cess' | 'permit' | 'misc' | 'gst'
  label: string
  /** Policy percent (direct input cell); null for amount-backed lines. */
  percent?: number | null
  /** Static amount (direct input); used by misc lines. */
  staticAmount?: number | null
}

export interface ProjectDashboardInput {
  projectName: string
  signatures?: SignatureFooterRow[]
  /** Authoritative line order and labels, shared with the Typst project book. */
  abstract?: ProjectAbstract
  /** Non-cover pages directly under the project root. */
  rootPages?: ProjectSheetPayload[]
  /** Every component/subcomponent that gets sheets (subs roll up as S- rows). */
  components: ProjectComponentInput[]
  /**
   * Component names (in order) that get General Abstract lines. Defaults to
   * all components; pass top-level components only — sub-component costs
   * already flow through their parent's S- rows, so listing them would
   * double-count.
   */
  genOrder?: string[]
  items: ProjectItemInput[]
  data: ProjectDataInput[]
  leads: ProjectLeadInput[]
  seigniorage: ProjectSeigInput[]
  charges: ProjectChargeInput[]
}

/** Quote a sheet name for formulas: 'O'Brien' -> 'O''Brien'. */
export function quoteProjectSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

/** Absolute reference to one cell: 'Sheet'!C5. */
export function projectCellRef(ref: ProjectCellRef): string {
  return `${quoteProjectSheet(ref.sheet)}!${columnLabel(ref.c)}${ref.r + 1}`
}

export function projectExcelFileName(projectName: string): string {
  const clean = (projectName || '').replace(/[\\/:*?"<>|]/g, '').trim() || 'Estimate'
  return `${clean} — Project Statement.xlsx`
}

const MONEY_FMT = '#,##0.00'
const QTY_FMT = '0.00'

interface MutableSheet {
  name: string
  cells: DetailGrid['cells']
  merges: DetailGrid['merges']
  colWidthsChars: number[]
  rowHeightsPt: DetailGrid['rowHeightsPt']
  landscape: boolean
}

function newSheet(name: string, colWidthsChars: number[], landscape = true): MutableSheet {
  return { name, cells: [], merges: [], colWidthsChars, rowHeightsPt: [], landscape }
}

function setH(sheet: MutableSheet, row: number, pt: number): void {
  while (sheet.rowHeightsPt.length <= row) sheet.rowHeightsPt.push(null)
  sheet.rowHeightsPt[row] = pt
}

function titleBlock(sheet: MutableSheet, title: string, subtitle: string): void {
  sheet.cells.push({ r: 0, c: 0, value: title, style: { bold: true, sizePt: 14, fontName: 'Trebuchet MS' } })
  sheet.merges.push({ r1: 0, c1: 0, r2: 0, c2: sheet.colWidthsChars.length - 1 })
  setH(sheet, 0, 22)
  if (subtitle) {
    sheet.cells.push({ r: 1, c: 0, value: subtitle, style: { bold: true, sizePt: 12, fontName: 'Trebuchet MS' } })
    sheet.merges.push({ r1: 1, c1: 0, r2: 1, c2: sheet.colWidthsChars.length - 1 })
    setH(sheet, 1, 20)
  }
}

function headerRow(sheet: MutableSheet, r: number, titles: string[]): void {
  titles.forEach((t, c) => {
    sheet.cells.push({ r, c, value: t, style: { bold: true, sizePt: 10, fontName: 'Trebuchet MS', align: 'center', wrap: true } })
  })
  setH(sheet, r, 30)
}

function uniqueName(taken: Set<string>, hint: string): string {
  const base = sanitizeSheetName(hint)
  if (!taken.has(base)) {
    taken.add(base)
    return base
  }
  let n = 2
  while (taken.has(`${base.slice(0, 28)}_${n}`)) n += 1
  const name = `${base.slice(0, 28)}_${n}`
  taken.add(name)
  return name
}

/** Row addresses for every referenceable cell, derived from input order. */
export interface ProjectAddressPlan {
  absSheet: Map<string, string>
  absQty: Map<string, ProjectCellRef>
  absTotal: Map<string, ProjectCellRef>
  genGrand: ProjectCellRef
  seigSheet: string
  genSheet: string
}

/**
 * Precompute every address the formulas will reference. Pure function of
 * the input order — no layout guessing, so a reference can never drift.
 */
export function planProjectAddresses(input: ProjectDashboardInput): ProjectAddressPlan {
  const taken = new Set<string>()
  const genSheet = uniqueName(taken, 'Gen Abstract')
  const absSheet = new Map<string, string>()
  for (const comp of input.components) absSheet.set(comp.name, uniqueName(taken, `Abstract_${comp.name}`))
  const seigSheet = uniqueName(taken, 'Seigniorage')

  const absQty = new Map<string, ProjectCellRef>()
  const absTotal = new Map<string, ProjectCellRef>()
  for (const comp of input.components) {
    const sheet = absSheet.get(comp.name) as string
    comp.itemKeys.forEach((key, i) => {
      if (absQty.has(key)) throw new Error(`Project Excel: duplicate item key '${key}'.`)
      absQty.set(key, { sheet, r: 3 + i, c: 3 })
    })
    // Direct rows, then S- roll-up rows, then a blank row, then TOTAL.
    const subs = comp.subs ?? []
    absTotal.set(comp.name, { sheet, r: 3 + comp.itemKeys.length + subs.length + 1, c: 6 })
  }
  const genNames = input.genOrder ?? input.components.map((c) => c.name)
  const genDataRows = genNames.length + 1 + input.charges.length
  // Component lines + TOTAL + charge rows, then the grand row — no gap.
  const genGrand: ProjectCellRef = { sheet: genSheet, r: 2 + genDataRows, c: 2 }
  return {
    absSheet, absQty, absTotal, genGrand,
    seigSheet, genSheet
  }
}

/**
 * Build the whole project workbook payload. Throws fail-loud on any
 * unresolvable reference (unknown keys, quantity with neither a detail cell
 * nor a static seed, missing policy percents) — never a silent static value.
 */
export function buildProjectDashboardPayload(input: ProjectDashboardInput): ProjectDashboardPayload {
  const plan = planProjectAddresses(input)
  const inputs: ProjectInputCell[] = []
  const links: ProjectFormulaLink[] = []
  const sheets: ProjectSheetPayload[] = []
  sheets.push(...(input.rootPages ?? []))
  const seenComp = new Set<string>()
  for (const comp of input.components) {
    if (seenComp.has(comp.name)) throw new Error(`Project Excel: duplicate component '${comp.name}'.`)
    seenComp.add(comp.name)
    if (comp.details.length !== comp.itemKeys.length) {
      throw new Error(`Project Excel: component '${comp.name}' details are not index-aligned with itemKeys.`)
    }
  }
  const itemByKey = new Map(input.items.map((it) => [it.key, it]))
  for (const comp of input.components) {
    for (const key of comp.itemKeys) {
      if (!itemByKey.has(key)) throw new Error(`Project Excel: item '${key}' listed but not provided.`)
    }
  }

  // ---- Detailed/template sheets first: their qty cells are quantity sources. ----
  const detQty = new Map<string, ProjectCellRef>()
  const detByComp = new Map<string, string>()
  for (const comp of input.components) {
    for (const templateSheet of comp.templateSheets ?? []) sheets.push(templateSheet)
    sheets.push(...(comp.pages ?? []))
    const det = buildComponentDetailedSheet(comp.name, comp.headers, comp.details)
    if (!det) continue
    det.qtyRefs.forEach((ref, slot) => {
      if (ref) detQty.set(comp.itemKeys[slot], { sheet: det.name, r: ref.r, c: ref.c })
    })
    detByComp.set(comp.name, det.name)
    sheets.push({ name: det.name, grid: det.grid, landscape: det.landscape, printSettings: comp.printSettings })
  }

  const body = { sizePt: 10, fontName: 'Trebuchet MS' }
  const qtyCell = (r: number, c: number, ref: ProjectCellRef): DetailGrid['cells'][number] => ({
    r, c, formula: `=${projectCellRef(ref)}`, numFmt: QTY_FMT, style: { ...body, align: 'center' }
  })

  // ---- Component Abstracts: qty -> Det, rate -> DATA, amount = qty*rate. ----
  for (const comp of input.components) {
    const sheet = newSheet(plan.absSheet.get(comp.name) as string, [7, 20, 58, 15, 10, 17, 19])
    titleBlock(sheet, input.projectName, `Component Statement — ${comp.name}`)
    headerRow(sheet, 2, ['S.No', 'Code', 'Description', 'Quantity', 'Unit', 'Rate (Rs.)', 'Cost (Rs.)'])
    comp.itemKeys.forEach((key, i) => {
      const item = itemByKey.get(key) as ProjectItemInput
      const r = 3 + i
      if (!item.dataKey) throw new Error(`Project Excel: item '${key}' has no DATA key.`)
      sheet.cells.push({ r, c: 0, value: String(i + 1), style: { ...body, align: 'center' } })
      sheet.cells.push({ r, c: 1, value: item.code, style: { ...body, align: 'center' } })
      sheet.cells.push({
        r, c: 2,
        value: item.description && item.description !== item.name ? `${item.name}\n${item.description}` : item.name,
        style: { ...body, align: 'left', wrap: true }
      })
      const live = item.detailRef ?? detQty.get(key)
      if (live) {
        sheet.cells.push(qtyCell(r, 3, live))
      } else if (item.requiresDetailQuantity) {
        throw new Error(`Project Excel: calculated item '${key}' has no fixed Detailed quantity cell.`)
      } else if (typeof item.staticQty === 'number') {
        sheet.cells.push({ r, c: 3, value: item.staticQty, numFmt: QTY_FMT, style: { ...body, align: 'center' } })
        inputs.push({ sheet: sheet.name, r, c: 3, reason: `static-qty-no-detail:${key}` })
      } else {
        throw new Error(`Project Excel: item '${key}' has neither a detail quantity cell nor a staticQty.`)
      }
      sheet.cells.push({ r, c: 4, value: item.unit, style: { ...body, align: 'center' } })
      sheet.cells.push({
        r, c: 5, formula: '=0', numFmt: MONEY_FMT, style: { ...body, align: 'right' }
      })
      links.push({ sheet: sheet.name, r, c: 5, kind: 'data-rate', key: item.dataKey })
      const dr = r + 1
      sheet.cells.push({
        r, c: 6,
        formula: `=${columnLabel(3)}${dr}*${columnLabel(5)}${dr}`,
        numFmt: MONEY_FMT, style: { ...body, align: 'right' }
      })
      setH(sheet, r, 16.5)
    })
    const subs = comp.subs ?? []
    subs.forEach((sub, si) => {
      const subTotal = plan.absTotal.get(sub)
      if (!subTotal) throw new Error(`Project Excel: sub-component '${sub}' of '${comp.name}' has no Abstract.`)
      const r = 3 + comp.itemKeys.length + si
      const dr = r + 1
      sheet.cells.push({ r, c: 0, value: `S${si + 1}`, style: { ...body, align: 'center' } })
      sheet.cells.push({ r, c: 2, value: sub, style: { ...body, align: 'left', wrap: true } })
      sheet.cells.push({ r, c: 3, formula: '=1', numFmt: QTY_FMT, style: { ...body, align: 'center' } })
      sheet.cells.push({ r, c: 4, value: 'LS', style: { ...body, align: 'center' } })
      sheet.cells.push({
        r, c: 5, formula: `=${projectCellRef(subTotal)}`, numFmt: MONEY_FMT, style: { ...body, align: 'right' }
      })
      sheet.cells.push({
        r, c: 6,
        formula: `=${columnLabel(3)}${dr}*${columnLabel(5)}${dr}`,
        numFmt: MONEY_FMT, style: { ...body, align: 'right' }
      })
      setH(sheet, r, 16.5)
    })
    const total = plan.absTotal.get(comp.name) as ProjectCellRef
    if (total.r !== 3 + comp.itemKeys.length + subs.length + 1) {
      throw new Error('Project Excel: address plan drifted from the Abstract layout.')
    }
    setH(sheet, total.r - 1, 8)
    sheet.cells.push({ r: total.r, c: 2, value: 'Total Cost', style: { ...body, bold: true, align: 'right' } })
    const first = 4
    const last = 3 + comp.itemKeys.length + subs.length
    sheet.cells.push({
      r: total.r, c: 6,
      formula: comp.itemKeys.length + subs.length ? `=SUM(${columnLabel(6)}${first}:${columnLabel(6)}${last})` : '=0',
      numFmt: MONEY_FMT, style: { ...body, bold: true, align: 'right' }
    })
    setH(sheet, total.r, 20)
    const abstractGrid = toGrid(sheet)
    // The PDF signs the component after its details. Put the Excel sign-off
    // on that final component sheet, before any separate Page-node tabs.
    const finalComponentSheetName = detByComp.get(comp.name) ?? comp.templateSheets?.at(-1)?.name
    const finalComponentSheet = sheets.find((candidate) => candidate.name === finalComponentSheetName)
    appendSignatureRows(finalComponentSheet?.grid ?? abstractGrid, comp.signatures ?? [])
    sheets.push({ name: sheet.name, grid: abstractGrid, landscape: true, printSettings: comp.printSettings })
  }

  const seigniorageLinks: ProjectSeigniorageLink[] = input.seigniorage.map((row) => {
    const workRefs = new Set<string>()
    const sourceTerms = row.terms?.length
      ? row.terms
      : row.itemKey
        ? [{ itemKey: row.itemKey, factor: row.qtyFactor ?? 1 }]
        : typeof row.staticQty === 'number'
          ? [{ staticQty: row.staticQty }]
          : []
    const terms = sourceTerms.map((term) => {
      if (term.itemKey) {
        const ref = plan.absQty.get(term.itemKey)
        if (!ref) throw new Error(`Project Excel: Seigniorage '${row.key}' references unknown item '${term.itemKey}'.`)
        const address = projectCellRef(ref)
        workRefs.add(address)
        return {
          formula: `=${address}*${term.factor ?? 1}`,
          leadVariantId: term.leadVariantId
        }
      }
      if (typeof term.staticQty === 'number') {
        return { formula: `=${term.staticQty}`, leadVariantId: term.leadVariantId }
      }
      throw new Error(`Project Excel: Seigniorage '${row.key}' contains an unresolved quantity term.`)
    })
    if (!terms.length) throw new Error(`Project Excel: Seigniorage '${row.key}' has no quantity terms.`)
    return {
      key: row.key,
      workQtyFormula: workRefs.size ? `=SUM(${Array.from(workRefs).join(',')})` : undefined,
      terms
    }
  })

  // ---- General Abstract: component TOTALs + charges + GST -> grand. ----
  {
    const sheet = newSheet(plan.genSheet, [7, 58, 19, 12])
    titleBlock(sheet, input.projectName, 'General Abstract of Estimate')
    headerRow(sheet, 1, ['S.No', 'Particulars', 'Amount (Rs.)', 'Basis %'])
    let r = 2
    let sl = 0
    const baseParts: string[] = []
    const genNames = input.genOrder ?? input.components.map((c) => c.name)
    const byName = new Map(input.components.map((c) => [c.name, c]))
    for (const genName of genNames) {
      const comp = byName.get(genName)
      if (!comp) throw new Error(`Project Excel: genOrder lists unknown component '${genName}'.`)
      sl += 1
      const total = plan.absTotal.get(comp.name) as ProjectCellRef
      sheet.cells.push({ r, c: 0, value: String(sl), style: { ...body, align: 'center' } })
      sheet.cells.push({ r, c: 1, value: comp.name, style: { ...body, align: 'left', wrap: true } })
      sheet.cells.push({
        r, c: 2, formula: `=${projectCellRef(total)}`,
        numFmt: MONEY_FMT, style: { ...body, align: 'right' }
      })
      baseParts.push(projectCellRef({ sheet: sheet.name, r, c: 2 }))
      setH(sheet, r, 16.5)
      r += 1
    }
    const totalRef: ProjectCellRef = { sheet: sheet.name, r, c: 2 }
    sheet.cells.push({ r, c: 1, value: 'TOTAL', style: { ...body, bold: true, align: 'right' } })
    sheet.cells.push({
      r, c: 2,
      formula: input.components.length ? `=SUM(${baseParts.join(',')})` : '=0',
      numFmt: MONEY_FMT, style: { ...body, bold: true, align: 'right' }
    })
    setH(sheet, r, 18)
    r += 1
    let gstCell: string | null = null
    for (const ch of input.charges) {
      sl += 1
      sheet.cells.push({ r, c: 0, value: String(sl), style: { ...body, align: 'center' } })
      sheet.cells.push({ r, c: 1, value: ch.label, style: { ...body, align: 'left', wrap: true } })
      const self: ProjectCellRef = { sheet: sheet.name, r, c: 2 }
      if (ch.kind === 'seigniorage') {
        sheet.cells.push({
          r, c: 2, formula: '=0',
          numFmt: MONEY_FMT, style: { ...body, align: 'right' }
        })
        links.push({ sheet: sheet.name, r, c: 2, kind: 'seigniorage', key: 'total' })
        baseParts.push(projectCellRef(self))
      } else if (ch.kind === 'dmf' || ch.kind === 'smet') {
        if (typeof ch.percent !== 'number') throw new Error(`Project Excel: charge '${ch.label}' needs a policy percent.`)
        sheet.cells.push({ r, c: 3, value: ch.percent, numFmt: QTY_FMT, style: { ...body, align: 'center' } })
        inputs.push({ sheet: sheet.name, r, c: 3, reason: `charge-percent:${ch.kind}` })
        sheet.cells.push({
          r, c: 2, formula: '=0',
          numFmt: MONEY_FMT, style: { ...body, align: 'right' }
        })
        links.push({ sheet: sheet.name, r, c: 2, kind: ch.kind, key: 'total' })
        baseParts.push(projectCellRef(self))
      } else if (ch.kind === 'nac' || ch.kind === 'cess') {
        if (typeof ch.percent !== 'number') throw new Error(`Project Excel: charge '${ch.label}' needs a policy percent.`)
        sheet.cells.push({ r, c: 3, value: ch.percent, numFmt: QTY_FMT, style: { ...body, align: 'center' } })
        inputs.push({ sheet: sheet.name, r, c: 3, reason: `charge-percent:${ch.kind}` })
        sheet.cells.push({
          r, c: 2,
          formula: `=${projectCellRef(totalRef)}*${projectCellRef({ sheet: sheet.name, r, c: 3 })}/100`,
          numFmt: MONEY_FMT, style: { ...body, align: 'right' }
        })
        baseParts.push(projectCellRef(self))
      } else if (ch.kind === 'permit') {
        sheet.cells.push({
          r, c: 2, formula: '=0',
          numFmt: MONEY_FMT, style: { ...body, align: 'right' }
        })
        links.push({ sheet: sheet.name, r, c: 2, kind: 'permit', key: 'total' })
        baseParts.push(projectCellRef(self))
      } else if (ch.kind === 'misc') {
        if (typeof ch.staticAmount !== 'number') throw new Error(`Project Excel: misc '${ch.label}' needs a staticAmount.`)
        sheet.cells.push({ r, c: 2, value: ch.staticAmount, numFmt: MONEY_FMT, style: { ...body, align: 'right' } })
        inputs.push({ sheet: sheet.name, r, c: 2, reason: `misc-amount:${ch.label}` })
        baseParts.push(projectCellRef(self))
      } else if (ch.kind === 'gst') {
        if (typeof ch.percent !== 'number') throw new Error(`Project Excel: GST needs a policy percent.`)
        sheet.cells.push({ r, c: 3, value: ch.percent, numFmt: QTY_FMT, style: { ...body, align: 'center' } })
        inputs.push({ sheet: sheet.name, r, c: 3, reason: 'charge-percent:gst' })
        sheet.cells.push({
          r, c: 2,
          formula: `=SUM(${baseParts.join(',')})*${projectCellRef({ sheet: sheet.name, r, c: 3 })}/100`,
          numFmt: MONEY_FMT, style: { ...body, align: 'right' }
        })
        gstCell = projectCellRef(self)
      }
      setH(sheet, r, 16.5)
      r += 1
    }
    // Upward whole-rupee rounding, mirroring roundEstimateTotalUp.
    const grand = plan.genGrand
    if (grand.r !== r) throw new Error('Project Excel: address plan drifted from the General Abstract layout.')
    sheet.cells.push({ r, c: 1, value: 'GRAND TOTAL', style: { ...body, bold: true, align: 'right' } })
    const baseExpr = baseParts.length ? `SUM(${baseParts.join(',')})` : '0'
    sheet.cells.push({
      r, c: 2,
      formula: gstCell ? `=CEILING(${baseExpr}+${gstCell},1)` : `=CEILING(${baseExpr},1)`,
      numFmt: MONEY_FMT, style: { ...body, bold: true, align: 'right' }
    })
    setH(sheet, r, 20)
    const authoritative = input.abstract?.lines
    if (authoritative && authoritative.length !== r - 1) {
      throw new Error('Project Excel: General Abstract line count differs from the project print data.')
    }
    const abstractRows: GeneralAbstractExcelRow[] = []
    for (let row = 2; row <= r; row += 1) {
      const label = String(sheet.cells.find((cell) => cell.r === row && cell.c === 1)?.value ?? '')
      const line = authoritative?.[row - 2] ?? {
        key: `row:${row}`,
        slNo: Number(sheet.cells.find((cell) => cell.r === row && cell.c === 0)?.value) || null,
        label,
        kind: row === r ? 'grand' as const : row === 2 + genNames.length ? 'total' as const : 'charge' as const
      }
      const amountCell = sheet.cells.find((cell) => cell.r === row && cell.c === 2)
      if (!amountCell || (amountCell.formula === undefined && typeof amountCell.value !== 'number')) {
        throw new Error(`Project Excel: General Abstract amount row ${row + 1} is missing.`)
      }
      if (authoritative && line.label !== label) {
        throw new Error(`Project Excel: General Abstract row ${row + 1} differs from project print data.`)
      }
      const percent = sheet.cells.find((cell) => cell.r === row && cell.c === 3)?.value
      abstractRows.push({
        line,
        amount: amountCell.formula ?? (amountCell.value as number),
        basisPercent: typeof percent === 'number' ? percent : undefined
      })
    }
    const generalAbstract = buildGeneralAbstractExcelSheet(input.projectName, abstractRows, sheet.name)
    appendSignatureRows(generalAbstract.grid, input.signatures ?? [])
    sheets.push(generalAbstract)
  }

  // Project-owned tab order. Rust prepends the shared Front Page and appends
  // the shared Lead/Seigniorage/DATA template sheets.
  const byName = new Map(sheets.map((s) => [s.name, s]))
  const orderedNames = [
    ...(input.rootPages ?? []).map((page) => page.name),
    plan.genSheet,
    ...input.components.flatMap((comp) => {
      const branch = [plan.absSheet.get(comp.name) as string]
      branch.push(...(comp.templateSheets ?? []).map((sheet) => sheet.name))
      const det = detByComp.get(comp.name)
      if (det) branch.push(det)
      branch.push(...(comp.pages ?? []).map((page) => page.name))
      return branch
    }),
  ]
  const ordered = orderedNames.map((n) => {
    const s = byName.get(n)
    if (!s) throw new Error(`Project Excel: planned sheet '${n}' was not built.`)
    return s
  })
  if (ordered.length !== sheets.length) throw new Error('Project Excel: sheet plan drifted from built sheets.')
  const names = sheets.map((s) => s.name)
  if (new Set(names).size !== names.length) throw new Error('Project Excel: duplicate sheet names in the workbook.')
  return {
    sheets: ordered,
    links,
    inputs,
    seigniorageLinks,
    coverCostRef: projectCellRef(plan.genGrand)
  }
}

function toGrid(sheet: MutableSheet): DetailGrid {
  return {
    cells: sheet.cells,
    merges: sheet.merges,
    colWidthsChars: sheet.colWidthsChars,
    rowHeightsPt: sheet.rowHeightsPt,
    images: [],
    rowBreaks: []
  }
}
