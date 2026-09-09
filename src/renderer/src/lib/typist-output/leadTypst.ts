import defaultTemplate from './lead.typ?raw'
/** Lead data adapter. The complete default layout is loaded verbatim from lead.typ. */

import type {
  EestimateProject,
  CompiledLeadDashboardEntry,
  LeadAssignment,
  LeadPoint,
  LeadVariant,
  ProjectLocation,
  SignatureFooterSettings
} from '../../types/project'
import { fmtMoney, fmtQty, escapeTypst } from './dataTypst'
import {
  applyDocumentSettingsToTypst,
  normalizeDocumentSettings,
  resolveProjectDocumentSettings,
  type DocumentSettings
} from './documentSettings'
import { LEAD_SIGNATURE_SCOPE, resolveSignatureFooter } from '../signatureFooter'
import { normalizeLeadPrintSettings, type NormalizedLeadPrintSettings } from '../leadPrintLayout'
import {
  computeLeadMapPageGeometry,
  LEAD_MAP_IMAGE_PATH,
  LEAD_MAP_PRINT_DPI
} from '../leadMapGeometry'
import type { LeadMapCaptureResult } from '../leadMapCapture'
import {
  buildLeadSourceCharts,
  type LeadSourceChart
} from './leadSourceChart'

export function routeLabelForVariant(
  variant: LeadVariant,
  _assignments: LeadAssignment[],
  points: LeadPoint[],
  site: ProjectLocation | null
): string {
  const pointsById = new Map(points.map((p) => [p.id, p]))

  const fromPoint = variant.startPointId ? pointsById.get(variant.startPointId) : null
  const fromName = fromPoint?.name || fromPoint?.code || 'Quarry / Source'

  const toPoint = variant.endPointId ? pointsById.get(variant.endPointId) : null
  const toName = toPoint?.name || toPoint?.code || site?.label || 'Project Site'

  const viaNames = (variant.viaPointIds ?? [])
    .map((id) => pointsById.get(id)?.name || pointsById.get(id)?.code)
    .filter(Boolean)

  if (viaNames.length > 0) {
    return `${fromName} \u2192 ${viaNames.join(' \u2192 ')} \u2192 ${toName}`
  }
  return `${fromName} \u2192 ${toName}`
}

export interface LeadBreakdownStep {
  quantity: number | null
  unit_rate: number | null
  amount_value: number | null
  label: string
  expression: string
  amount: string
}

export interface LeadBreakdownItem {
  sl: string
  name: string
  lead_km: string
  route: string
  conveyance_class: string
  rate: string
  rate_unit: string
  steps: LeadBreakdownStep[]
  calculation: CompiledLeadDashboardEntry['chargeBreakdown'] | null
  lift_m: number
  included_lift_m: number | null
  charged_lift_m: number | null
  lift_unit_rate: number | null
  material_rate: string
  loading_rate: string
  unloading_rate: string
  lift_rate: string
}

export interface LeadRenderRow {
  sl: string
  name: string
  quarry: string
  conveyance_class: string
  lead_km: string
  lift_m: string
  rate: string
  rate_unit: string
  uses: string
}

export interface LeadMapVariable {
  available: boolean
  path: string
  title: string
  subtitle: string
  width_mm: number
  height_mm: number
}

export interface LeadMapGalleryItem {
  id: string
  name: string
  path: string
  width: number
  height: number
  type: 'drawing'
  typstSnippet: string
  previewUrl?: string
}

export interface LeadRenderData {
  materials: Array<LeadBreakdownItem & { summary: LeadRenderRow }>
  title: string
  subtitle: string
  year: string
  zone: string
  notes: string
  project: string
  rows: LeadRenderRow[]
  breakdowns: LeadBreakdownItem[]
  signature: Array<{ designation: string; office: string }>
  map: LeadMapVariable
  charts: LeadSourceChart[]
}

export const LEAD_MAP_TYPST_SNIPPET = `#if Lead.map.at("available", default: false) {
  pagebreak()
  // E-Estimate lead map page: begin
  #image("images/lead-route-map.png", width: 100%)
  // E-Estimate lead map page: end
}`

export const LEAD_MAP_PAGE_BEGIN = '// E-Estimate lead map page: begin'
export const LEAD_MAP_PAGE_END = '// E-Estimate lead map page: end'

const LEAD_MAP_SECTION = /#if Lead\.map(?:\.available|\.at\("available"[^)]*\))\s*[\[{][\s\S]*?\/\/ E-Estimate lead map page: end\s*[\]}]/

/** Saved layouts used to force a page after the source chart; keep the statement flowing. */
export function continueLeadAfterCharts(source: string): string {
  return source
    .replace(/(\]\s*)\r?\n[ \t]*#pagebreak\(\)\s*\r?\n(?=[ \t]*== A\. Summary)/, '$1\n\n')
    .replace(/(#if Lead\.charts\.len\(\) > 0 \[)\s*#pagebreak\(\)\s*/, '$1\n  ')
}

function typstPaperName(pageSize: string): string {
  if (pageSize === 'Letter') return 'us-letter'
  if (pageSize === 'Legal') return 'us-legal'
  return pageSize.toLowerCase()
}

/** Map-page Typst generated from Map Print Layout GUI values. */
export function buildLeadMapPageTypst(
  layout: NormalizedLeadPrintSettings,
  signatureFooter?: SignatureFooterSettings,
  interactive = false
): string {
  const geometry = computeLeadMapPageGeometry(layout, signatureFooter, interactive)
  const widthMm = geometry.mapBox.widthMm.toFixed(2)
  const heightMm = geometry.mapBox.heightMm.toFixed(2)
  const title = escapeTypst(layout.mapTitle || 'Lead Route Map')
  const subtitle = escapeTypst(layout.mapSubtitle || '')
  const header = layout.showMapHeader
    ? `#block(width: 100%)[
  #text(size: 1.25em, weight: "bold", fill: rgb("#18201d"))[${title}]
${layout.mapSubtitle.trim() ? `  #v(2pt)\n  #text(size: 0.85em, fill: rgb("#555d59"))[${subtitle}]\n` : ''}  #v(8pt)
  #line(length: 100%, stroke: 1.5pt + rgb("#354b44"))
]
#v(10pt)
`
    : ''
  const signature = signatureFooter?.enabled && signatureFooter.rows.length
    ? `#block(width: 100%, height: 1fr, breakable: false)[#align(bottom)[
  #line(length: 100%, stroke: 0.65pt + rgb("#6f7d85"))
  #v(3mm)
  #grid(
    columns: ${signatureFooter.rows.length},
    gutter: 10mm,
    align: center,
    ..(${signatureFooter.rows.map((row) => `[#v(10mm)\n#line(length: 82%, stroke: 0.7pt + rgb("#273b47"))\n#v(2mm)\n#text(9pt, weight: "bold", fill: rgb("#172f3d"))[${escapeTypst(row.designation)}]${row.office.trim() ? `\n#linebreak()\n#text(8pt, fill: rgb("#596a73"))[${escapeTypst(row.office)}]` : ''}]`).join(', ')},)
  )
]]
`
    : ''
  return `${LEAD_MAP_PAGE_BEGIN}
#set page(paper: "${typstPaperName(geometry.paper)}", flipped: ${geometry.flipped}, margin: (top: ${geometry.margins.top}mm, right: ${geometry.margins.right}mm, bottom: ${geometry.margins.bottom}mm, left: ${geometry.margins.left}mm))
${header}#align(center)[
  #box(
    width: ${widthMm}mm,
    height: ${heightMm}mm,
    stroke: 0.8pt + rgb("#9fb1c0"),
    radius: 3pt,
    clip: true
  )[#image("${LEAD_MAP_IMAGE_PATH}", width: ${widthMm}mm, height: ${heightMm}mm, fit: "cover")]
]
${signature}${LEAD_MAP_PAGE_END}`
}

function embedLeadMapBlockInDocument(block: string): string {
  const setPageMatch = block.match(/#set page\([^\n]+\)\r?\n/)
  const pageRule = setPageMatch
    ? setPageMatch[0].replace('#set page', 'set page')
    : 'set page(paper: "a4", flipped: true)\n'
  const rest = (setPageMatch ? block.replace(setPageMatch[0], '') : block)
    .replace(LEAD_MAP_PAGE_BEGIN, '')
    .replace(LEAD_MAP_PAGE_END, '')
    .trim()
  return `#if Lead.map.at("available", default: false) {
  pagebreak()
  metadata(Lead.map.at("_ee_print_id", default: ""))
  ${LEAD_MAP_PAGE_BEGIN}
  ${pageRule.trim()}
  [
${rest}
  ]
  ${LEAD_MAP_PAGE_END}
}`
}

/** Rewrite the managed map-page block in lead.typ from the Map Print Layout GUI. */
export function applyLeadMapLayoutToTypst(
  source: string,
  layout: NormalizedLeadPrintSettings,
  signatureFooter?: SignatureFooterSettings,
  interactive = false
): string {
  const section = embedLeadMapBlockInDocument(buildLeadMapPageTypst(layout, signatureFooter, interactive))
  const flowed = continueLeadAfterCharts(source)
  if (LEAD_MAP_SECTION.test(flowed)) return flowed.replace(LEAD_MAP_SECTION, section)
  const managed = new RegExp(`${LEAD_MAP_PAGE_BEGIN}[\\s\\S]*?${LEAD_MAP_PAGE_END}`)
  if (managed.test(flowed)) return flowed.replace(managed, section)
  return `${flowed.trimEnd()}\n\n${section}\n`
}

export function extractLeadMapPageTypst(source: string): string {
  const match = source.match(new RegExp(`${LEAD_MAP_PAGE_BEGIN}[\\s\\S]*?${LEAD_MAP_PAGE_END}`))
  if (!match) return source
  return match[0].replace(/^(\s*)set page\(/m, '$1#set page(')
}

/** Inject Map Print Layout into saved (or default) lead.typ. Used only on Map Studio Save. */
export function injectSavedLeadMapTypst(
  saved: string | undefined,
  layout: NormalizedLeadPrintSettings,
  signatureFooter: SignatureFooterSettings | undefined,
  fallbackSource: string
): string {
  const base = saved !== undefined
    ? continueLeadAfterCharts(literalLeadTypstHeadings(saved))
    : fallbackSource
  return applyLeadMapLayoutToTypst(base, layout, signatureFooter, false)
}

export function leadMapCaptureFromProject(project: EestimateProject): LeadMapCaptureResult | null {
  const dataUrl = project.printStudioShadowFiles?.[LEAD_MAP_IMAGE_PATH]
  if (!dataUrl) return null
  const layout = normalizeLeadPrintSettings(project.leadChart?.printSettings)
  const signature = resolveSignatureFooter(project, LEAD_SIGNATURE_SCOPE)
  const geometry = computeLeadMapPageGeometry(layout, signature, false)
  return {
    dataUrl,
    widthPx: Math.max(1, Math.round(geometry.mapBox.widthMm * LEAD_MAP_PRINT_DPI / 25.4)),
    heightPx: Math.max(1, Math.round(geometry.mapBox.heightMm * LEAD_MAP_PRINT_DPI / 25.4))
  }
}

export function leadMapShadowFilesFromProject(project: EestimateProject): Record<string, string> {
  const dataUrl = project.printStudioShadowFiles?.[LEAD_MAP_IMAGE_PATH]
  return dataUrl ? { [LEAD_MAP_IMAGE_PATH]: dataUrl } : {}
}

export function buildLeadMapVariable(
  project: EestimateProject,
  capture?: LeadMapCaptureResult | null
): LeadMapVariable {
  const layout = normalizeLeadPrintSettings(project.leadChart?.printSettings)
  const signature = resolveSignatureFooter(project, LEAD_SIGNATURE_SCOPE)
  const geometry = computeLeadMapPageGeometry(layout, signature, false)
  return {
    available: Boolean(capture?.dataUrl || project.printStudioShadowFiles?.[LEAD_MAP_IMAGE_PATH]),
    path: LEAD_MAP_IMAGE_PATH,
    title: layout.mapTitle || 'Lead Route Map',
    subtitle: layout.mapSubtitle || '',
    width_mm: Number(geometry.mapBox.widthMm.toFixed(2)),
    height_mm: Number(geometry.mapBox.heightMm.toFixed(2))
  }
}

export function leadMapGalleryItem(
  map: LeadMapVariable,
  capture?: LeadMapCaptureResult | null
): LeadMapGalleryItem[] {
  return [{
    id: 'lead-route-map',
    name: map.title || 'Lead Route Map',
    path: map.path,
    width: capture?.widthPx ?? Math.max(1, Math.round(map.width_mm * 300 / 25.4)),
    height: capture?.heightPx ?? Math.max(1, Math.round(map.height_mm * 300 / 25.4)),
    type: 'drawing',
    typstSnippet: LEAD_MAP_TYPST_SNIPPET,
    previewUrl: capture?.dataUrl
  }]
}

export function leadStudioRuntimeData(
  project: EestimateProject,
  entries: CompiledLeadDashboardEntry[],
  capture?: LeadMapCaptureResult | null
): LeadRenderData & { gallery: LeadMapGalleryItem[] } {
  const data = buildLeadRenderData(project, entries, capture)
  return { ...data, gallery: leadMapGalleryItem(data.map, capture) }
}

export function leadMapShadowFilesFromCapture(
  capture?: LeadMapCaptureResult | null
): Record<string, string> {
  if (!capture?.dataUrl) return {}
  return { [LEAD_MAP_IMAGE_PATH]: capture.dataUrl }
}

export function resolveLeadMaterialPrintName(
  project?: EestimateProject | null,
  entry?: CompiledLeadDashboardEntry
): string {
  if (!entry) return ''
  const custom = project?.leadPrintOverrides?.variantNames?.[entry.variantId]
  if (custom && custom.trim()) return custom.trim()
  return entry.variantName || entry.materialName
}

/** Build the runtime data from the compiled lead entries. */
export function buildLeadRenderData(
  project: EestimateProject,
  entries: CompiledLeadDashboardEntry[],
  mapCapture?: LeadMapCaptureResult | null
): LeadRenderData {
  const overrides = project.leadPrintOverrides ?? {}
  const signature = resolveSignatureFooter(project, LEAD_SIGNATURE_SCOPE)
  const chart = project.leadChart ?? { points: [], assignments: [], variants: [] }
  const variantsById = new Map((chart.variants ?? []).map((v) => [v.id, v]))
  const zone =
    project.meta.sorZone === 'zone_1'
      ? 'Zone I'
      : project.meta.sorZone === 'zone_2'
        ? 'Zone II'
        : 'Zone III'

  const data: Omit<LeadRenderData, 'materials'> = {
    title: overrides.title || 'LEAD STATEMENT & CONVEYANCE CHARGES',
    subtitle: overrides.subtitle || 'Lead Statement & Conveyance Charges',
    year: project.meta.sorYear || '2025-26',
    zone,
    notes: overrides.notes || '',
    project: project.meta.name || project.root.name || '',
    rows: entries.map((entry, index) => {
      const variant = variantsById.get(entry.variantId)
      const route = variant
        ? routeLabelForVariant(
            variant,
            chart.assignments ?? [],
            chart.points ?? [],
            project.meta.location ?? null
          )
        : 'Quarry / Source'

      return {
        sl: String(index + 1),
        name: resolveLeadMaterialPrintName(project, entry),
        quarry: route,
        conveyance_class: entry.conveyanceClass,
        lead_km: `${fmtQty(entry.leadKm)} km`,
        lift_m: entry.liftM > 0 ? `${fmtQty(entry.liftM)} m` : '0.00',
        rate: entry.variantRate != null
          ? `Rs. ${fmtMoney(entry.variantRate)} / ${entry.rateUnit || 'unit'}`
          : '—',
        rate_unit: entry.rateUnit || 'unit',
        uses: String(entry.applications.length)
      }
    }),
    breakdowns: entries.map((entry, index) => {
      const variant = variantsById.get(entry.variantId)
      const route = variant
        ? routeLabelForVariant(
            variant,
            chart.assignments ?? [],
            chart.points ?? [],
            project.meta.location ?? null
          )
        : 'Quarry / Source → Project Site'

      const calculation = entry.chargeBreakdown ?? null
      const chargedLiftM = calculation ? (calculation.liftRate > 0 ? Math.max(0, Math.ceil(entry.liftM - 3)) : 0) : null
      const steps: LeadBreakdownStep[] =
        entry.breakdown && entry.breakdown.length > 0
          ? entry.breakdown.map((s) => ({
              quantity: s.quantity ?? null,
              unit_rate: s.unitRate ?? null,
              amount_value: s.amount,
              label: s.label,
              expression: s.expression,
              amount: `Rs. ${fmtMoney(s.amount)}`
            }))
          : [
              {
                quantity: null,
                unit_rate: null,
                amount_value: entry.variantRate,
                label: `Conveyance charges for ${fmtQty(entry.leadKm)} km`,
                expression: `${fmtQty(entry.leadKm)} km`,
                amount: entry.variantRate != null ? `Rs. ${fmtMoney(entry.variantRate)}` : '—'
              }
            ]

      return {
        sl: String(index + 1),
        name: resolveLeadMaterialPrintName(project, entry),
        lead_km: `${fmtQty(entry.leadKm)} km`,
        route,
        conveyance_class: entry.conveyanceClass,
        rate: entry.variantRate != null ? fmtMoney(entry.variantRate) : '—',
        rate_unit: entry.rateUnit || 'unit',
        steps,
        calculation,
        lift_m: entry.liftM,
        included_lift_m: calculation ? 3 : null,
        charged_lift_m: chargedLiftM,
        lift_unit_rate: calculation && chargedLiftM ? calculation.liftRate / chargedLiftM : null,
        material_rate: calculation ? fmtMoney(calculation.leadRate) : '—',
        loading_rate: calculation ? fmtMoney(calculation.loadingRate) : '—',
        unloading_rate: calculation ? fmtMoney(calculation.unloadingRate) : '—',
        lift_rate: calculation ? fmtMoney(calculation.liftRate) : '—'
      }
    }),
    signature: signature?.enabled
      ? signature.rows.map((row) => ({ designation: row.designation, office: row.office }))
      : [],
    map: buildLeadMapVariable(project, mapCapture),
    charts: buildLeadSourceCharts(project, entries)
  }
  return { ...data, materials: data.breakdowns.map((material, index) => ({ ...material, summary: data.rows[index] })) }
}

/** The `inputs` map handed to the Typst compiler on preview/export. */
export function leadCompileInputs(
  project: EestimateProject,
  entries: CompiledLeadDashboardEntry[],
  mapCapture?: LeadMapCaptureResult | null
): Record<string, string> {
  return { 'ee-data': JSON.stringify(buildLeadRenderData(project, entries, mapCapture)) }
}

/**
 * App-owned helper prelude.
 */
export const LEAD_TABLE_PRELUDE = `// E-Estimate Lead Helper Functions\n`

/**
 * Saved layouts can contain presentation code only. Some older AI-created
 * layouts reference `Lead` but omit the runtime binding provided by the
 * built-in template. This binding is added only to the compile copy.
 */
const LEAD_RUNTIME_BINDING = `#let Lead = (
  materials: (),
  signature: (),
  notes: "",
  project: "",
  year: "",
  zone: "",
  map: (available: false, path: "images/lead-route-map.png", title: "", subtitle: "", width_mm: 0, height_mm: 0),
  charts: (),
  ..json(bytes(sys.inputs.at("ee-data")))
)

`

export function leadCompileSource(source: string, prelude = LEAD_TABLE_PRELUDE): string {
  const hasLeadBinding = /^\s*#let\s+Lead\s*=/m.test(source)
  return `${prelude}${hasLeadBinding ? '' : LEAD_RUNTIME_BINDING}${source}`
}

/** Load the default layout without interpolating any project values into its code. */
export function leadTypstTemplate(
  _entries?: CompiledLeadDashboardEntry[],
  _project?: EestimateProject
): string {
  return defaultTemplate
}

/** Convert only the former default heading lines; preserve the rest of custom source. */
export function literalLeadTypstHeadings(source: string): string {
  return source
    .replace(/^= #EE\.title(?=\r?$)/gm, '= LEAD STATEMENT & CONVEYANCE CHARGES')
    .replace(/^#align\(center\)\[#emph\[#EE\.subtitle\]\](?=\r?$)/gm,
      '#align(center)[#emph[Lead Statement & Conveyance Charges]]')
}

export function resolveLeadDocumentSettings(project: EestimateProject): DocumentSettings {
  return resolveProjectDocumentSettings(project.projectPrintSettings)
}

/** Preserve saved source exactly; apply initial document settings only to the default. */
export function resolvedLeadTypstSource(
  project: EestimateProject,
  entries: CompiledLeadDashboardEntry[]
): string {
  const projectSettings = resolveLeadDocumentSettings(project)
  const moduleSettings = normalizeDocumentSettings(
    project.printStudioDocumentSettings?.['lead-statement'] ?? projectSettings,
    projectSettings
  )
  const saved = project.printStudioDocuments?.['lead-statement']
  const layout = normalizeLeadPrintSettings(project.leadChart?.printSettings)
  const signature = resolveSignatureFooter(project, LEAD_SIGNATURE_SCOPE)
  if (saved !== undefined) return saved
  return applyLeadMapLayoutToTypst(
    applyDocumentSettingsToTypst(leadTypstTemplate(), moduleSettings),
    layout,
    signature,
    false
  )
}
