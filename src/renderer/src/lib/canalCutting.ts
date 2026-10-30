import type { CanalData, CanalSection } from '../types/project'
import {
  calculateSectionStrataBands, canalBankIntegrationSections, canalBedLevelAt,
  canalSectionGeometry, orderedCanalSections, round3
} from './canal'
import { ermClassIndex } from './canalErm'

export const CUTTING_MATERIALS = ['All soils', 'HDR', 'F&F', 'Hard rock', 'Unclassified'] as const
export type CuttingMaterialAreas = [number, number, number, number, number]

/** Measure the polygons used by CanalSectionDiagram; never rebuild a symmetric cut. */
export function measureCanalCuttingSection(data: CanalData, section: CanalSection) {
  const geometry = canalSectionGeometry(data, section)
  const strata = section.strata?.length ? calculateSectionStrataBands(data, section, geometry) : []
  const materialAreas: CuttingMaterialAreas = [0, 0, 0, 0, 0]
  strata.forEach((band, index) => {
    const layer = section.strata![index]
    const material = ermClassIndex(layer, index)
    if (material >= 0 && material < 4) materialAreas[material] += band.area
  })
  materialAreas[4] = Math.max(0, geometry.areas.cutting - materialAreas.slice(0, 4).reduce((sum, area) => sum + area, 0))
  materialAreas.forEach((area, index) => { materialAreas[index] = round3(area) })
  const bedLevel = canalBedLevelAt(data, section.chainage)
  const tbl = bedLevel == null ? Infinity : bedLevel + data.design.fullSupplyDepth + data.design.freeBoard
  const shelves = geometry.design.flatMap((point, index, points) => {
    const next = points[index + 1]
    return next && Math.abs(point.rl - next.rl) < 1e-6 && point.rl >= tbl - 1e-6 &&
      point.offset * next.offset > 0 && Math.abs(next.offset - point.offset) > 1e-6
      ? [{ side: point.offset < 0 ? 'Left' : 'Right', rl: point.rl, width: Math.abs(next.offset - point.offset) }]
      : []
  })
  return { section, geometry, areas: geometry.areas, strata, materialAreas, shelves }
}

export type CanalCuttingSectionMeasurement = ReturnType<typeof measureCanalCuttingSection>

/** Same integration sections and mean-area rule as canalEarthworkTotals (canal prism only). */
export function measureCanalCutting(data: CanalData) {
  const integration = canalBankIntegrationSections(data)
  const sections = (integration.length ? integration : orderedCanalSections(data))
    .filter(section => section.designPopulated !== false && section.ground.length >= 2)
    .map(section => measureCanalCuttingSection(data, section))
    .filter(row => row.geometry.design.length >= 2)
  const reaches = sections.flatMap((end, index) => {
    const start = sections[index - 1]
    if (!start) return []
    const length = end.section.chainage - start.section.chainage
    if (!(length > 0)) return []
    const volume = (start.areas.cutting + end.areas.cutting) / 2 * length
    const materialVolumes = start.materialAreas.map((area, i) => (area + end.materialAreas[i]) / 2 * length) as CuttingMaterialAreas
    return [{ start, end, length, volume, materialVolumes }]
  })
  const totalVolume = round3(reaches.reduce((sum, reach) => sum + reach.volume, 0))
  const materialVolumes = CUTTING_MATERIALS.map((_, i) => round3(reaches.reduce((sum, reach) => sum + reach.materialVolumes[i], 0))) as CuttingMaterialAreas
  return { sections, reaches, totalVolume, materialVolumes }
}

export type CanalCuttingMeasurement = ReturnType<typeof measureCanalCutting>
