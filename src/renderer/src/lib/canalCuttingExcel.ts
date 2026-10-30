import type { DetailGrid } from './excel-output/detailGrid'
import { CUTTING_MATERIALS, type CanalCuttingMeasurement } from './canalCutting'

function grid(headers: string[], note: string): DetailGrid {
  return {
    cells: [
      { r: 0, c: 0, value: note, style: { wrap: true } },
      ...headers.map((value, c) => ({ r: 2, c, value, style: { bold: true, wrap: true, colorRgb: 'FFFFFF', bgRgb: '164E63' } }))
    ],
    merges: [{ r1: 0, c1: 0, r2: 0, c2: headers.length - 1 }], images: [], rowBreaks: [],
    colWidthsChars: headers.map(() => 20), rowHeightsPt: [42, 12, 36]
  }
}

function row(target: DetailGrid, r: number, values: (string | number)[]): void {
  values.forEach((value, c) => target.cells.push({ r, c, value, ...(typeof value === 'number' ? { numFmt: '0.000' } : {}) }))
  target.rowHeightsPt[r] = 22
}

function formula(target: DetailGrid, r: number, c: number, expression: string): void {
  // Formulas are attached immediately after adding their row.
  for (let i = target.cells.length - 1; i >= 0; i--) {
    const cell = target.cells[i]
    if (cell.r === r && cell.c === c) {
      cell.formula = `=${expression}`
      return
    }
  }
  throw new Error('Missing cutting workbook cell.')
}

/** Export measured geometry, with auditable polygon-area and mean-section-volume formulas. */
export function buildCanalCuttingExcel(result: CanalCuttingMeasurement) {
  const polygons = grid(['Section', 'Chainage (m)', 'Cut zone', 'Offset X (m)', 'RL Y (m)', 'Next X (m)', 'Next Y (m)', 'X × next Y − next X × Y', 'Polygon area (m²)'],
    'Coordinates are the excavation polygons drawn in the section diagram. Area = ABS(SUM(X × next Y − next X × Y)) / 2. The last point closes back to the first.')
  const sections = grid(['Section', 'Chainage (m)', 'Cut area (m²)', 'Fill area (m²)', ...CUTTING_MATERIALS.map(name => `${name} (m²)`)],
    'Cut areas come from the diagram polygons. Soil and rock areas are intersections with the entered geological layers. Uninvestigated excavation remains unclassified. Integration samples include reach boundaries.')
  const strata = grid(['Section', 'Chainage (m)', 'Material', 'Top RL (m)', 'Bottom RL (m)', 'Area (m²)'],
    'Material areas are measured by clipping the same excavation polygons at the saved layer RLs. Areas are measured values; the cut coordinates and volumes have live formulas.')
  const volumes = grid(['From Ch (m)', 'To Ch (m)', 'Length (m)', 'Start cut (m²)', 'End cut (m²)', 'Volume (m³)', ...CUTTING_MATERIALS.map(name => `${name} (m³)`)],
    'Canal prism excavation from the section diagrams. Each interval volume = (start area + end area) / 2 × chainage length. Extra CNS/lining excavation is measured separately in Earthwork.')
  let polygonRow = 3
  let strataRow = 3
  result.sections.forEach((measurement, index) => {
    const references: string[] = []
    measurement.geometry.cutPolygons.forEach((polygon, zone) => {
      const first = polygonRow
      polygon.points.forEach((point, i) => {
        const next = polygon.points[(i + 1) % polygon.points.length]
        const r = polygonRow++
        row(polygons, r, [index + 1, measurement.section.chainage, zone + 1, point.offset, point.rl, next.offset, next.rl,
          point.offset * next.rl - next.offset * point.rl, ''])
        formula(polygons, r, 7, `D${r + 1}*G${r + 1}-F${r + 1}*E${r + 1}`)
      })
      const r = polygonRow++
      row(polygons, r, [index + 1, measurement.section.chainage, zone + 1, '', '', '', '', 'Area', polygon.area])
      formula(polygons, r, 8, `ABS(SUM(H${first + 1}:H${r}))/2`)
      references.push(`'Cut Polygons'!I${r + 1}`)
    })
    const r = index + 3
    row(sections, r, [index + 1, measurement.section.chainage, measurement.areas.cutting, measurement.areas.filling, ...measurement.materialAreas])
    formula(sections, r, 2, references.length ? `ROUND(SUM(${references.join(',')}),3)` : '0')
    measurement.strata.forEach(band => row(strata, strataRow++, [index + 1, measurement.section.chainage, band.name, band.topRl, band.bottomRl, band.area]))
  })
  result.reaches.forEach((reach, index) => {
    const r = index + 3
    const start = result.sections.indexOf(reach.start) + 4
    const end = result.sections.indexOf(reach.end) + 4
    row(volumes, r, [reach.start.section.chainage, reach.end.section.chainage, reach.length, reach.start.areas.cutting, reach.end.areas.cutting, reach.volume, ...reach.materialVolumes])
    formula(volumes, r, 0, `'Section Areas'!B${start}`)
    formula(volumes, r, 1, `'Section Areas'!B${end}`)
    formula(volumes, r, 2, `B${r + 1}-A${r + 1}`)
    formula(volumes, r, 3, `'Section Areas'!C${start}`)
    formula(volumes, r, 4, `'Section Areas'!C${end}`)
    formula(volumes, r, 5, `(D${r + 1}+E${r + 1})/2*C${r + 1}`)
    CUTTING_MATERIALS.forEach((_, i) => {
      const column = String.fromCharCode(69 + i)
      formula(volumes, r, i + 6, `('Section Areas'!${column}${start}+'Section Areas'!${column}${end})/2*C${r + 1}`)
    })
  })
  const totalRow = result.reaches.length + 3
  row(volumes, totalRow, ['TOTAL', '', '', '', '', result.totalVolume, ...result.materialVolumes])
  for (let c = 5; c <= 10; c++) {
    const column = String.fromCharCode(65 + c)
    formula(volumes, totalRow, c, result.reaches.length ? `ROUND(SUM(${column}4:${column}${totalRow}),3)` : '0')
  }
  return { kind: 'page' as const, page: { name: 'Cutting Volumes', landscape: true, grid: volumes,
    extraSheets: [{ name: 'Section Areas', grid: sections }, { name: 'Cut Polygons', grid: polygons }, { name: 'Strata Areas', grid: strata }] } }
}
