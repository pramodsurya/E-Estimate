// Bund print data adapter. Layout is authored in bund.typ; template differences
// are flags on the JSON payload, not separate documents.
import type { BundBerm, BundData, BundSection, EestimateProject, ProjectNode } from '../../../types/project'
import * as measurement from '../../bund'
import * as drawings from '../../bundFigures'
import { sectionSvg, zonedRepairHeartingStations } from './bundGeometry'
import { phreaticFigureData } from './bundPhreaticFigure'
import { resolveNodeSettingsOverrides } from '../../nodeSettings'
import { resolveSignatureFooter } from '../../signatureFooter'
import { findNode } from '../../tree'
import { descriptionRunsForDisplay, plainTextRun } from '../../rateAnalysisVisibility'
import type { RateAnalysisTextRun } from '../../../types/rateAnalysis'
import {
  applyDocumentSettingsToTypst,
  normalizeDocumentSettings,
  resolveProjectDocumentSettings
} from '../documentSettings'
import bundTypstSource from './bund.typ?raw'

export function bundLayoutKind(data: BundData): string {
  return `${data.mode === 'new' ? 'new' : 'repair'}-${measurement.isZonedBund(data) ? 'zoned' : 'homogeneous'}`
}

export function bundDocumentKey(node: ProjectNode): string {
  return `bund:${node.id}:${bundLayoutKind(node.bund!)}`
}

export function bundLayoutLabel(data: BundData): string {
  const zoned = measurement.isZonedBund(data)
  if (data.mode === 'new') return zoned ? 'NEW · ZONED' : 'NEW · HOMOGENEOUS'
  return zoned ? 'REPAIR · ZONED' : 'REPAIR · HOMOGENEOUS'
}

export function bundTypstTemplate(_data?: BundData): string {
  return bundTypstSource
}

export function bundDocumentSettings(project: EestimateProject, node: ProjectNode) {
  // Project print settings are the baseline; node-tree overrides sit on top.
  // Bund's detailed estimate is always landscape.
  const contentSettings = bundContentDocumentSettings(project, node)
  return { ...contentSettings, orientation: 'landscape' as const }
}

function bundContentDocumentSettings(project: EestimateProject, node: ProjectNode) {
  // The diagram and SOQ temporarily override orientation. All later content
  // returns to these inherited project/node document settings.
  const projectSettings = resolveProjectDocumentSettings(project.projectPrintSettings)
  const overrides = resolveNodeSettingsOverrides(project.root, node.id)
  return normalizeDocumentSettings({
    pageSize: overrides.pageSize ?? projectSettings.pageSize,
    orientation: overrides.orientation ?? projectSettings.orientation,
    margins: overrides.margins ?? projectSettings.margins,
    fontFamily: projectSettings.fontFamily,
    fontSizePt: projectSettings.fontSizePt * (overrides.reportFontPercent ?? 100) / 100
  }, projectSettings)
}

function landscapePaperWidthMm(pageSize: string): number {
  switch (pageSize) {
    case 'A2': return 594
    case 'A3': return 420
    case 'Letter': return 279.4
    case 'Legal': return 355.6
    default: return 297 // A4
  }
}

function bundItemDescriptionRuns(
  project: EestimateProject,
  item: ProjectNode,
  componentId: string
): RateAnalysisTextRun[] {
  const itemKey = item.projectDataId
    ? `PROJECT_DATA:${item.projectDataId}`
    : item.splitFromItemKey
      ? `SPLIT:${item.createdDataId ?? item.id}`
      : `${item.itemSource ?? 'OTHERS'}:${item.categoryKey ?? 'custom'}:${item.itemCode?.trim() || item.id}${
          item.dataVariant ? `:${item.dataVariant.kind}:${item.dataVariant.key}` : ''
        }`
  const recipe = project.rateAnalysisScopedOverrides?.[componentId]?.[itemKey] ??
    project.rateAnalysisOverrides?.[itemKey] ??
    project.dashboardSnapshot?.recipes[item.id]
  if (recipe?.layout?.descriptionRuns?.length) {
    return descriptionRunsForDisplay(recipe.description, recipe.layout.descriptionRuns)
  }
  const projectData = item.projectDataId
    ? project.projectData?.find(definition => definition.id === item.projectDataId)
    : undefined
  return [plainTextRun(projectData?.description || item.itemDescription || item.name || '')]
}

export function resolvedBundTypstSource(project: EestimateProject, node: ProjectNode): string {
  const key = bundDocumentKey(node)
  return project.printStudioDocuments?.[key] ?? applyDocumentSettingsToTypst(
    bundTypstTemplate(node.bund!),
    project.printStudioDocumentSettings?.[key] ?? bundDocumentSettings(project, node)
  )
}

// SVG is data, never interpolated into Typst source. Add the XML namespace for
// existing figures that previously inherited it from the browser's HTML parser.
function svgData(svg: string): string {
  return svg && !svg.includes('xmlns=') ? svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"') : svg
}

function withLeadingBerms(data: BundData, berms: BundBerm[]): BundData {
  return { ...data, design: { ...data.design, berms } }
}

function incrementalBermQuantity(
  data: BundData,
  berm: BundBerm,
  quantityOf: (next: BundData) => number
): number {
  const index = (data.design.berms ?? []).findIndex(candidate => candidate.id === berm.id)
  if (index < 0) return 0
  const before = quantityOf(withLeadingBerms(data, data.design.berms.slice(0, index)))
  const after = quantityOf(withLeadingBerms(data, data.design.berms.slice(0, index + 1)))
  return after - before
}

function payableComponentTerms(
  data: BundData,
  body: { role: string; label: string; quantity: number },
  bermQuantity: (berm: BundBerm) => number
) {
  return [
    body,
    ...(data.design.berms ?? []).map(berm => ({
      role: `berm:${berm.id}`,
      label: measurement.bermSourceLabel(berm),
      quantity: bermQuantity(berm)
    }))
  ].filter(term => Math.abs(term.quantity) > 1e-9)
}

function expandPayableTerms(data: BundData, item: measurement.BundRequiredItem) {
  if (item.role === 'formation' || item.role === 'rolling') {
    return payableComponentTerms(
      data,
      {
        role: 'bund',
        label: 'Bund',
        quantity: measurement.rowsTotal(measurement.grossFormationRows(withLeadingBerms(data, [])))
      },
      berm => measurement.rowsTotal(measurement.grossBermFillRows(data, berm))
    ).concat(data.rockToeMaterial ? [{
      role: 'rocktoe-deduction',
      label: 'Less: Rock toe',
      quantity: -measurement.rowsTotal(measurement.rockToeRows(data))
    }] : [])
  }
  if (item.role === 'casing' || item.role === 'casing-rolling') {
    return payableComponentTerms(
      data,
      {
        role: 'casing',
        label: 'Casing',
        quantity:
          measurement.rowsTotal(measurement.grossFormationRows(withLeadingBerms(data, []))) -
          measurement.rowsTotal(measurement.heartingRows(withLeadingBerms(data, [])))
      },
      berm => measurement.rowsTotal(measurement.grossBermFillRows(data, berm))
    ).concat(data.rockToeMaterial ? [{
      role: 'rocktoe-deduction',
      label: 'Less: Rock toe',
      quantity: -measurement.rowsTotal(measurement.rockToeRows(data))
    }] : [])
  }
  if (item.role === 'turfing') {
    return payableComponentTerms(
      data,
      { role: 'bund', label: 'Bund', quantity: measurement.rowsTotal(measurement.turfingRows(withLeadingBerms(data, []))) },
      berm => incrementalBermQuantity(data, berm, next => measurement.rowsTotal(measurement.turfingRows(next)))
    )
  }
  if (item.role === 'pitching') {
    return payableComponentTerms(
      data,
      {
        role: 'bund',
        label: 'Bund',
        quantity: measurement.pitchingMeasuredQuantity(withLeadingBerms(data, [])).quantity
      },
      berm => incrementalBermQuantity(data, berm, next => measurement.pitchingMeasuredQuantity(next).quantity)
    )
  }
  return [{
    role: item.role,
    label: item.sourceLabel ?? measurement.roleLabel(item.role),
    quantity: item.quantity
  }]
}

function surveyStations(data: BundData, section: BundSection) {
  const geometry = measurement.bundLevelingGeometry(data, section)
  if (!geometry) return []
  const hidden = new Set((section.hiddenLevelOffsets ?? []).map(value => Math.round(value * 1000) / 1000))
  const offsets = [...new Set([
    ...geometry.existing.map(point => point.offset), ...geometry.proposed.map(point => point.offset),
    ...geometry.formation.flatMap(band => [band.fromOffset, band.toOffset]),
    ...geometry.stripping.flatMap(band => [band.fromOffset, band.toOffset])
  ].map(value => Math.round(value * 1000) / 1000))].filter(value => !hidden.has(value)).sort((a, b) => a - b)
  const origin = Math.min(measurement.upstreamToeOffset(section, data), offsets[0] ?? 0)
  return offsets.map(offset => ({
    offset, ch: offset - origin,
    el: measurement.existLevelAt(geometry.existing, offset),
    rl: measurement.existLevelAt(geometry.proposed, offset)
  }))
}

function stationCalculations(stations: Array<{ offset: number; ch: number; el: number; rl: number; depth?: number }>) {
  return stations.map((station, index) => {
    const previous = stations[index - 1]
    const width = previous ? station.ch - previous.ch : null
    const start_depth = previous ? previous.depth ?? previous.rl - previous.el : null
    const end_depth = station.depth ?? station.rl - station.el
    return { offset_m: station.offset, distance_m: station.ch, existing_rl: station.el,
      proposed_rl: station.rl, width_m: width, start_depth_m: start_depth, end_depth_m: end_depth,
      signed_area_m2: width == null || start_depth == null ? null : width * (start_depth + end_depth) / 2 }
  })
}

/** Surveyed ground length between the designed toes (not its horizontal projection). */
function surveyedGroundPerimeter(data: BundData, section: BundSection): number | null {
  if ((section.pre?.length ?? 0) < 2) return null
  const geometry = measurement.bundLevelingGeometry(data, section)
  if (!geometry) return null
  const from = geometry.limits.usToeOffset
  const to = geometry.limits.dsToeOffset
  const offsets = [...new Set([
    from,
    ...geometry.existing.filter(point => point.offset > from && point.offset < to).map(point => point.offset),
    to
  ])].sort((a, b) => a - b)
  let length = 0
  for (let index = 1; index < offsets.length; index += 1) {
    const first = offsets[index - 1]
    const second = offsets[index]
    length += Math.hypot(
      second - first,
      measurement.existLevelAt(geometry.existing, second) - measurement.existLevelAt(geometry.existing, first)
    )
  }
  return Math.round(length * 1000) / 1000
}

/** True only when entered EGL points add detail beyond the two-toe straight line. */
function hasDetailedSurveyedGround(section: BundSection): boolean {
  const points = [...(section.pre ?? [])].sort((a, b) => a.offset - b.offset)
  if (points.length < 3) return false
  const first = points[0]
  const last = points.at(-1)!
  const run = last.offset - first.offset
  if (Math.abs(run) < 1e-9) return false
  return points.slice(1, -1).some(point => {
    const fraction = (point.offset - first.offset) / run
    const straightLineRl = first.rl + fraction * (last.rl - first.rl)
    return Math.abs(point.rl - straightLineRl) > 0.0005
  })
}

export function buildBundRenderData(project: EestimateProject, node: ProjectNode) {
  const data = measurement.migrateBundData(node.bund!)
  const sections = measurement.orderedSections(data)
  const governing = measurement.steepestSection(data) ?? sections[0]
  const zoned = measurement.isZonedBund(data)
  const schedules: Record<string, ReturnType<typeof schedule>> = {}
  function schedule(rows: measurement.BundQtyRow[], factor = 1, unit = 'm³') {
    return {
      unit,
      rows: rows.map(row => ({ from_chainage: measurement.formatChainage(row.fromCh, data.chainageUnit),
        to_chainage: measurement.formatChainage(row.toCh, data.chainageUnit), length_m: row.lengthM,
        start_section: row.areaFrom * factor, end_section: row.areaTo * factor,
        average_section: row.meanArea * factor, quantity: row.qty * factor })),
      total: measurement.rowsTotal(rows) * factor
    }
  }
  schedules.foundation = schedule(measurement.strippingRows(data))
  if (zoned) {
    schedules.casing = schedule(measurement.casingRows(data))
    schedules.hearting = schedule(measurement.heartingRows(data))
    if (measurement.heartingTrenchEnabled(data)) schedules.cutoff_trench = schedule(measurement.heartingTrenchRows(data))
  } else schedules.formation = schedule(measurement.plainFormationRows(data))
  if (data.clearanceMaterial && data.clearanceMode !== 'manual') schedules.clearance = schedule(measurement.clearancePerimeterRows(data))
  if (data.upstreamToe.excavationMaterial) schedules.upstream_toe = schedule(measurement.toeExcavationRows(data, data.upstreamToe))
  if (data.downstreamToe.excavationMaterial) schedules.downstream_drain = schedule(measurement.toeExcavationRows(data, data.downstreamToe))
  if (data.upstreamToe.buildMaterial) schedules.upstream_protection = schedule(measurement.toeBuildRows(data, data.upstreamToe), measurement.toeBuildMeasure(data.upstreamToe) === 'volume' ? measurement.toeBuildThicknessM(data.upstreamToe) : 1)
  if (data.downstreamToe.buildMaterial) schedules.downstream_protection = schedule(measurement.toeBuildRows(data, data.downstreamToe), measurement.toeBuildMeasure(data.downstreamToe) === 'volume' ? measurement.toeBuildThicknessM(data.downstreamToe) : 1)
  if (data.pitchingMaterial) schedules.revetment = schedule(measurement.pitchingRows(data), measurement.pitchingMeasuredQuantity(data).measure === 'volume' ? measurement.pitchingThicknessM(data) : 1)
  if (data.turfingMaterial) schedules.turfing = schedule(measurement.turfingRows(data))
  if (data.rockToeMaterial) {
    schedules.rock_toe = schedule(measurement.rockToeRows(data))
    if (data.rockToeExcavationMaterial) schedules.rock_toe_excavation = schedule(measurement.rockToeExcavationRows(data))
    if (data.rockToeFilterMaterial) schedules.rock_toe_filter = schedule(measurement.rockToeFilterRows(data))
  }
  if (measurement.internalFiltersAvailable(data) && data.horizontalFilterMaterial) {
    schedules.horizontal_filter = schedule(measurement.horizontalFilterRows(data))
    if (data.verticalFilterMaterial) schedules.chimney_filter = schedule(measurement.verticalFilterRows(data))
  }
  if (schedules.clearance) schedules.clearance.unit = 'm²'
  if (schedules.turfing) schedules.turfing.unit = 'm²'
  if (schedules.revetment) schedules.revetment.unit = measurement.pitchingMeasuredQuantity(data).measure === 'volume' ? 'm³' : 'm²'
  if (schedules.horizontal_filter) schedules.horizontal_filter.unit = measurement.horizontalFilterMeasure(data) === 'volume' ? 'm³' : 'm²'
  if (schedules.chimney_filter) schedules.chimney_filter.unit = measurement.verticalFilterMeasure(data) === 'volume' ? 'm³' : 'm²'
  if (schedules.upstream_protection) schedules.upstream_protection.unit = measurement.toeBuildMeasure(data.upstreamToe) === 'volume' ? 'm³' : 'm²'
  if (schedules.downstream_protection) schedules.downstream_protection.unit = measurement.toeBuildMeasure(data.downstreamToe) === 'volume' ? 'm³' : 'm²'
  // Chute drains are discrete works, but the HTML statement expresses them as
  // an equivalent quantity per metre across every surveyed interval. Expose the
  // same statement rows so Typst can use the identical Section / Average / Total
  // presentation without re-measuring the work.
  const totalRun = Math.max(0, (sections.at(-1)?.chainage ?? 0) - (sections[0]?.chainage ?? 0))
  const constantStatementSchedule = (total: number, unit: string) => {
    const perM = totalRun > 0 ? total / totalRun : 0
    return {
      unit,
      rows: sections.slice(1).map((section, index) => {
        const previous = sections[index]
        const length = section.chainage - previous.chainage
        return {
          from_chainage: measurement.formatChainage(previous.chainage, data.chainageUnit),
          to_chainage: measurement.formatChainage(section.chainage, data.chainageUnit),
          length_m: length,
          start_section: perM,
          end_section: perM,
          average_section: perM,
          quantity: perM * length
        }
      }),
      total
    }
  }
  if (data.chuteDrainExcavationMaterial && totalRun > 0) {
    schedules.chute_excavation = constantStatementSchedule(measurement.chuteDrainExcavationQuantity(data), 'm³')
  }
  if (data.chuteDrainLiningMaterial && totalRun > 0) {
    const chute = measurement.chuteDrainProtectionMeasurement(data)
    schedules.chute_lining = constantStatementSchedule(chute.quantity, chute.measure === 'volume' ? 'm³' : 'm²')
  }
  data.design.berms.forEach((berm, index) => {
    schedules[`berm_fill_${index}`] = schedule(measurement.bermFillRows(data, berm))
    if (berm.surfaceMaterial) {
      const measured = measurement.bermSurfaceMeasurement(data, berm)
      schedules[`berm_surface_${index}`] = schedule(
        measurement.bermSurfaceRows(data, berm),
        measured.measure === 'volume' ? Math.max(0, berm.surfaceThickness || 0) : 1,
        measured.measure === 'volume' ? 'm³' : 'm²'
      )
    }
    if (berm.drainLiningMaterial) {
      const measured = measurement.bermDrainProtectionMeasurement(data, berm)
      schedules[`berm_drain_${index}`] = schedule(
        measurement.bermDrainProtectionRows(data, berm),
        measured.measure === 'volume' ? Math.max(0, berm.drainLiningThickness || 0) : 1,
        measured.measure === 'volume' ? 'm³' : 'm²'
      )
    }
    if (berm.drainExcavationMaterial && berm.drainLiningMaterial) {
      schedules[`berm_drain_exc_${index}`] = schedule(measurement.bermDrainExcavationRows(data, berm))
    }
  })
  const excavationSources = [
    { role: 'stripping', quantity: schedules.foundation.total },
    { role: 'ustoe-exc', quantity: schedules.upstream_toe?.total ?? 0 },
    { role: 'dstoe-exc', quantity: schedules.downstream_drain?.total ?? 0 },
    { role: 'rocktoe-exc', quantity: schedules.rock_toe_excavation?.total ?? 0 },
    { role: 'hearting-trench-exc', quantity: data.heartingTrench.excavationMaterial ? schedules.cutoff_trench?.total ?? 0 : 0 },
    { role: 'chute-exc', quantity: data.chuteDrainExcavationMaterial ? measurement.chuteDrainExcavationQuantity(data) : 0 },
    {
      role: 'berm-drain-exc',
      quantity: data.design.berms
        .filter(berm => berm.drainExcavationMaterial && berm.drainLiningMaterial)
        .reduce((sum, berm) => sum + measurement.rowsTotal(measurement.bermDrainExcavationRows(data, berm)), 0),
      material: data.design.berms.find(berm => berm.drainExcavationMaterial && berm.drainLiningMaterial)
        ?.drainExcavationMaterial
    }
  ].filter(source => source.quantity > 0)
  const mergedByRole = new Map<string, (typeof excavationSources)[number]>()
  for (const source of excavationSources) {
    const existing = mergedByRole.get(source.role)
    if (existing) existing.quantity += source.quantity
    else mergedByRole.set(source.role, { ...source })
  }
  const mergedExcavationSources = [...mergedByRole.values()]
  const excavation = mergedExcavationSources.map(source => {
    const isChannel = ['stripping', 'dstoe-exc', 'chute-exc', 'berm-drain-exc'].includes(source.role)
    const configuredBands = source.role === 'stripping' && data.soilBands?.length
      ? data.soilBands
      : data.excavationBands?.[source.role as keyof typeof data.excavationBands]
    const defaultBands = measurement.defaultBundExcavationRows(
      (source as any).material ?? undefined,
      isChannel ? 'channel' : 'foundation'
    )
    const bands = configuredBands && configuredBands.length > 0 ? configuredBands : defaultBands
    return {
      ...source,
      classes: bands
        .filter(band => band.pct > 0 && band.material?.code)
        .map(band => ({
          soil: band.label,
          percent: band.pct,
          code: band.material.code,
          description: band.material.description ?? '',
          quantity: source.quantity * band.pct / 100
        }))
    }
  })
  const excavationRoleLabels: Record<string, string> = {
    stripping: 'Foundation stripping',
    'ustoe-exc': 'Upstream toe wall',
    'dstoe-exc': 'Downstream toe wall',
    'rocktoe-exc': 'Rock-toe foundation',
    'hearting-trench-exc': 'Hearting cut-off trench',
    'chute-exc': 'Chute drains',
    'berm-drain-exc': 'Berm catch-water drains'
  }
  const excavationByCode = new Map<string, {
    code: string
    description: string
    descriptionRuns: RateAnalysisTextRun[]
    terms: Array<{ role: string; label: string; quantity: number }>
    total: number
  }>()
  for (const source of excavation) {
    for (const soil of source.classes) {
      const registryItem = (data.materialItems ?? []).find(
        item => item.role === source.role && item.code === soil.code
      )
      const itemNode = registryItem ? findNode(project.root, registryItem.itemNodeId) : null
      let grouped = excavationByCode.get(soil.code)
      if (!grouped) {
        const description = itemNode?.itemDescription || soil.description || ''
        grouped = {
          code: soil.code,
          description,
          descriptionRuns: itemNode
            ? bundItemDescriptionRuns(project, itemNode, node.id)
            : description ? [{ text: description, bold: false, italic: false, underline: false }] : [],
          terms: [],
          total: 0
        }
        excavationByCode.set(soil.code, grouped)
      }
      const existingTerm = grouped.terms.find(term => term.role === source.role)
      if (existingTerm) existingTerm.quantity += soil.quantity
      else grouped.terms.push({
        role: source.role,
        label: excavationRoleLabels[source.role] ?? source.role,
        quantity: soil.quantity
      })
      grouped.total += soil.quantity
    }
  }
  const payableByCode = new Map<string, {
    code: string
    description: string
    descriptionRuns: RateAnalysisTextRun[]
    unit: string
    terms: Array<{ role: string; label: string; quantity: number }>
    total: number
  }>()
  for (const source of measurement.requiredItemSources(data)) {
    if (measurement.isBundExcavationRole(source.role)) continue
    const key = measurement.requiredItemGroupKey(source)
    const registryItem = (data.materialItems ?? []).find(
      item => item.role === source.role && item.code === source.ref.code
    )
    const itemNode = registryItem ? findNode(project.root, registryItem.itemNodeId) : null
    let grouped = payableByCode.get(key)
    if (!grouped) {
      const description = itemNode?.itemDescription || source.ref.description || ''
      grouped = {
        code: source.ref.code,
        description,
        descriptionRuns: itemNode
          ? bundItemDescriptionRuns(project, itemNode, node.id)
          : description ? [{ text: description, bold: false, italic: false, underline: false }] : [],
        unit: source.ref.unit ?? (source.measure === 'volume' ? 'm³' : 'm²'),
        terms: [],
        total: 0
      }
      payableByCode.set(key, grouped)
    }
    for (const term of expandPayableTerms(data, source)) {
      const existingTerm = grouped.terms.find(candidate => candidate.role === term.role)
      if (existingTerm) existingTerm.quantity += term.quantity
      else grouped.terms.push({ ...term })
      grouped.total += term.quantity
    }
  }
  const signature = resolveSignatureFooter(project, node.id)
  const phreaticFigure = phreaticFigureData(data)
  const chuteProtection = measurement.chuteDrainProtectionMeasurement(data)
  const chuteWidth = Math.max(0, data.chuteDrainWidth || 0)
  const chuteDepth = Math.max(0, data.chuteDrainDepth || 0)
  const contentDocumentSettings = bundContentDocumentSettings(project, node)
  return {
    layout_kind: bundLayoutKind(data),
    layout_label: bundLayoutLabel(data),
    is_new: data.mode === 'new',
    is_zoned: zoned,
    show_freeboard: measurement.usesFreeBoardDesign(data),
    show_hearting: zoned,
    show_cutoff_trench: measurement.heartingTrenchAvailable(data),
    show_repair_kind: zoned && data.mode !== 'new',
    project_name: project.meta.name, component_name: node.name,
    document_settings: {
      paper: contentDocumentSettings.pageSize.toLowerCase(),
      flipped: contentDocumentSettings.orientation === 'landscape',
      margins: contentDocumentSettings.margins,
      // Statement-of-quantity sheets are always landscape. Passing the actual
      // usable width lets Typst choose a panel capacity without relying on a
      // zero-width contextual measurement.
      statement_page_width_mm: landscapePaperWidthMm(contentDocumentSettings.pageSize)
        - contentDocumentSettings.margins.left - contentDocumentSettings.margins.right
    },
    design: data.design, hearting_design: data.heartingDesign,
    cutoff_trench: { ...data.heartingTrench, resolved_depth_m: measurement.resolvedHeartingTrenchDepth(data), area_m2: measurement.heartingTrenchArea(data) },
    chute_geometry: {
      width_m: chuteWidth,
      depth_m: chuteDepth,
      lining_thickness_m: Math.max(0, data.chuteDrainLiningThickness || 0),
      excavation_area_m2: chuteWidth * chuteDepth,
      lined_perimeter_m: chuteWidth + 2 * chuteDepth,
      protection_measure: chuteProtection.measure,
      protection_unit: chuteProtection.measure === 'volume' ? 'm³' : 'm²',
      equivalent_section_unit: chuteProtection.measure === 'volume' ? 'm³/m' : 'm²/m'
    },
    length_m: data.lengthM, datum_rl: data.datum, repair_kind: data.zonedRepairKind, soil_source: data.zonedSoilSource,
    formation_enabled: data.formationEnabled, compaction_enabled: data.compactionEnabled,
    configuration: data, schedules, excavation,
    excavation_by_code: [...excavationByCode.values()],
    payable_by_code: [...payableByCode.values()].filter(item => item.terms.length > 0),
    clearance_manual: data.clearanceMaterial && data.clearanceMode === 'manual'
      ? data.clearanceManualRows.map(row => ({ ...row, quantity: (row.length ?? 0) * (row.breadth ?? 0) })) : [],
    chute_rows: data.chuteDrainLiningMaterial || data.chuteDrainExcavationMaterial ? measurement.chuteDrainRows(data) : [],
    payable_items: measurement.requiredItems(data).map(item => ({ role: item.role, code: item.ref.code,
      description: item.ref.description ?? '', unit: item.ref.unit ?? (item.measure === 'volume' ? 'm³' : 'm²'),
      quantity: item.quantity, measure: item.measure })),
    sections: sections.map((section, index) => {
      const geometry = measurement.bundLevelingGeometry(data, section)
      const areas = measurement.sectionAreas(data, section)
      const groundPerimeter = surveyedGroundPerimeter(data, section)
      // Generated stations can exist at every chainage. A section is detailed
      // only when its entered EGL contains a real break from the two-toe line.
      const hasTwoDistinctToeInputs =
        section.upstreamGroundLevel != null &&
        section.downstreamGroundLevel != null &&
        Math.abs(section.upstreamGroundLevel - section.downstreamGroundLevel) > 1e-6
      // A section set out from separate toe levels is printed as a detailed
      // cross-section, using their average in the statement table.
      const separateToeLevels = section.separateToeLevels === true || hasTwoDistinctToeInputs
      const detailedGroundProfile = data.mode === 'new' && (
        separateToeLevels || hasDetailedSurveyedGround(section)
      )
      const upstreamToeRl = section.upstreamGroundLevel ?? (geometry
        ? measurement.existLevelAt(geometry.existing, geometry.limits.usToeOffset)
        : section.groundLevel ?? null)
      const downstreamToeRl = section.downstreamGroundLevel ?? (geometry
        ? measurement.existLevelAt(geometry.existing, geometry.limits.dsToeOffset)
        : section.groundLevel ?? null)
      const toeRl = upstreamToeRl != null && downstreamToeRl != null
        ? (upstreamToeRl + downstreamToeRl) / 2
        : null
      return { chainage: measurement.formatChainage(section.chainage, data.chainageUnit),
        chainage_m: section.chainage, average_toe_rl: toeRl,
        separate_toe_levels: separateToeLevels,
        upstream_toe_rl: upstreamToeRl,
        downstream_toe_rl: downstreamToeRl,
        detailed_ground_profile: detailedGroundProfile,
        ground_perimeter_m: groundPerimeter,
        height_m: toeRl == null ? null : Math.max(0, data.design.topLevel - (toeRl - data.design.stripDepth)),
        // A detailed EGL survey measures the occupied bund width along the
        // actual ground surface. Flat/single-level sections retain toe-to-toe width.
        base_width_m: detailedGroundProfile && groundPerimeter != null
          ? groundPerimeter
          : (geometry ? geometry.limits.dsToeOffset - geometry.limits.usToeOffset : null),
        svg: svgData(sectionSvg(data, section, index)), areas,
        stations: stationCalculations(surveyStations(data, section)),
        hearting_stations: zoned ? stationCalculations(zonedRepairHeartingStations(data, section)) : [],
        fill_bands: geometry?.formation ?? [], cut_bands: measurement.bundNetStrippingBands(data, section),
        hearting_bands: zoned ? measurement.heartingRepairBands(data, section) : [] }
    }),
    drawings: {
      // Same geometry as BundAssemblyDiagram; print makeup (tan ground, dark labels).
      assembly: governing ? svgData(drawings.assemblyFigure(data, governing)) : '',
      upstream_toe: data.upstreamToe.excavationMaterial ? svgData(drawings.usToeFigure(data)) : '',
      downstream_drain: governing && data.downstreamToe.excavationMaterial ? svgData(drawings.dsDrainFigure(data, measurement.toeDrainDepthAt(governing, data))) : '',
      rock_toe: data.rockToeMaterial ? svgData(drawings.rockToeFigure(data, governing ?? null)) : '',
      filters: governing && schedules.horizontal_filter ? svgData(drawings.filterFigure(data, governing)) : '',
      chute: data.chuteDrainLiningMaterial || data.chuteDrainExcavationMaterial ? svgData(drawings.chuteFigure(data)) : ''
    },
    berms: data.design.berms.map((berm, index) => ({ ...berm, schedule_index: index, svg: svgData(drawings.bermFigure(data, berm)),
      surface: berm.surfaceMaterial ? measurement.bermSurfaceMeasurement(data, berm) : null,
      drain: berm.drainLiningMaterial ? measurement.bermDrainProtectionMeasurement(data, berm) : null,
      excavation: berm.drainExcavationMaterial ? schedule(measurement.bermDrainExcavationRows(data, berm)) : null })),
    phreatic: phreaticFigure ? {
      svg: svgData(phreaticFigure.svg), chainage: measurement.formatChainage(phreaticFigure.section.chainage, data.chainageUnit),
      baseline: phreaticFigure.reference, selected: phreaticFigure.actual
    } : null,
    signature: signature?.enabled ? signature.rows.map(row => ({ designation: row.designation, office: row.office })) : []
  }
}

export function bundCompileInputs(project: EestimateProject, node: ProjectNode): Record<string, string> {
  // Bund layout is appended to the Component Typ document, so it reads its own
  // dedicated input (`ee-bund`) rather than clashing with the component `ee-data`.
  return { 'ee-bund': JSON.stringify(buildBundRenderData(project, node)) }
}

/**
 * Bund variables exposed to any Custom layout — the bund data bound to the same
 * self-explanatory names the injected default uses. Prepending this lets a saved
 * (custom) component layout for a bund component reference `top-bund-level-rl`,
 * `bund-length-m`, `sections`, `drawings`, `payable-items`, etc. without any
 * injection of the default bund layout.
 */
export function bundVariablesPrelude(): string {
  return `#let Bund = json(bytes(sys.inputs.at("ee-bund")))
#let project-name = Bund.project_name
#let component-name = Bund.component_name
#let design = Bund.design
#let bund-length-m = Bund.length_m
#let datum-rl = Bund.datum_rl
#let top-bund-level-rl = design.topLevel
#let crest-width-m = design.topWidth
#let upstream-slope = design.usSlope
#let downstream-slope = design.dsSlope
#let max-water-level-m = design.mwl
#let full-tank-level-m = design.ftl
#let freeboard-m = design.freeBoard
#let is-new = Bund.at("is_new", default: true)
#let is-zoned = Bund.at("is_zoned", default: false)
#let show-freeboard = Bund.at("show_freeboard", default: is-new)
#let show-hearting = Bund.at("show_hearting", default: is-zoned)
#let show-cutoff-trench = Bund.at("show_cutoff_trench", default: false)
#let layout-label = Bund.at("layout_label", default: "")
#let sections = Bund.sections
#let schedules = Bund.schedules
#let drawings = Bund.drawings
#let excavation-sources = Bund.excavation
#let payable-items = Bund.payable_items
#let berms = Bund.berms
#let phreatic = Bund.phreatic
#let signature = Bund.signature`
}

/**
 * Inject the bund detailed-estimate layout onto a Component Typ document. The
 * component typ renders only its banner + Abstract of Estimate: the per-item
 * "every item on its own page" section is removed, the bund layout is inserted
 * after the abstract, and any externally-added (non-template) items are then
 * allowed to flow after it. One signature block is kept at the very end
 * (the component typ's), so the bund layout's own signature is stripped.
 */
export function injectBundLayout(
  componentSource: string,
  project: EestimateProject,
  node: ProjectNode,
  renderData?: { items?: Array<{ templateGenerated?: boolean }> }
): string {
  // Component typ -> keep only up to the Abstract (drop the item-detail section,
  // keep the signature section for the very end).
  const section2Mark = '// Section 2: Detailed Estimates (Child Items)'
  const section3Mark = '// Section 3: Signatures'
  const section2Idx = componentSource.indexOf(section2Mark)
  let section1 = componentSource
  let section3 = ''
  if (section2Idx !== -1) {
    const section3Idx = componentSource.indexOf(section3Mark)
    section1 = componentSource.slice(0, section2Idx)
    section3 = section3Idx !== -1 ? componentSource.slice(section3Idx) : ''
  }

  // Bund layout, minus its own signature block (one signature prints at the end).
  const bundLayout = resolvedBundTypstSource(project, node).replace(
    /\n#if (?:Bund\.)?signature\.len\(\) > 0 \{[^}]*\}\s*$/s,
    ''
  )

  // Externally-added items (not template-generated) follow the bund layout.
  const hasExternal = (renderData?.items ?? []).some((item) => !item.templateGenerated)
  const itemsLoop = hasExternal
    ? '\n\n#for item in EE.items [\n  #if not item.at("templateGenerated", default: false) [\n    #render-component-item(item)\n    #v(12pt)\n  ]\n]\n'
    : ''

  return `${section1.trimEnd()}\n\n#pagebreak(weak: true)\n${bundLayout.trimEnd()}${itemsLoop}\n\n${section3.trimStart()}`
}
