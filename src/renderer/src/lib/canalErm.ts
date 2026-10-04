import type { CanalData, CanalErmColumn, CanalSection, CanalSoilStratum } from '../types/project'

export const ERM_LAYERS = [
  { name: 'All Soils + SDR', color: '#d97706', slope: 1.5 },
  { name: 'Hard Disintegrated Rock (HDR)', color: '#b45309', slope: 0.75 },
  { name: 'Fissured & Fractured Rock (F&F)', color: '#475569', slope: 0.5 },
  { name: 'Hard Rock (HR)', color: '#1e293b', slope: 0.25 }
]

export const ERM_CLASSES = ['all-soils', 'hdr', 'ff', 'hr'] as const
export const ERM_CLASS_CODES = ['IRR-CAW-1-1', 'IRR-CAW-1-4', 'IRR-CAW-1-6', 'IRR-CAW-1-7']
const DEFAULT_COLUMNS: CanalErmColumn[] = ERM_LAYERS.slice(0, 3).map((layer, i) => ({ id: `erm-column-${i}`, name: layer.name, excavationClass: ERM_CLASSES[i] }))
export function getErmColumns(data?: Pick<CanalData, 'ermColumns'>): CanalErmColumn[] {
  return data?.ermColumns?.length ? data.ermColumns : DEFAULT_COLUMNS
}
export function ermClassIndex(layer: CanalSoilStratum, fallback: number): number {
  return layer.ermClass ? ERM_CLASSES.indexOf(layer.ermClass) : fallback
}

/** Insert an absent layer so existing boundaries and quantities remain unchanged. */
export function addErmColumn(data: CanalData, column: CanalErmColumn, at: number): CanalData {
  const columns = [...getErmColumns(data)]
  const index = Math.max(0, Math.min(columns.length, at))
  columns.splice(index, 0, column)
  const preset = ERM_LAYERS[ERM_CLASSES.indexOf(column.excavationClass)]
  const sections = data.sections.map((section) => {
    if (section.strataTopRl == null || !section.strata?.length) return section
    const strata = section.strata.map((layer, i) => ({ ...layer, ermClass: layer.ermClass ?? (i < columns.length - 1 ? getErmColumns(data)[i]?.excavationClass : 'hr') }))
    strata.splice(index, 0, { ...preset, id: `${section.id}-${column.id}`, name: column.name, ermClass: column.excavationClass, thickness: 0 })
    return { ...section, strata }
  })
  return { ...data, ermColumns: columns, sections }
}

/** Geological datum; never modifies the surveyed ground profile. */
export function canalStrataTopRl(section: CanalSection): number {
  if (Number.isFinite(section.strataTopRl)) return section.strataTopRl as number
  if (section.groundEntryMode === 'separate' && section.leftToeRl != null && section.rightToeRl != null) return (section.leftToeRl + section.rightToeRl) / 2
  return section.leftToeRl ?? [...section.ground].sort((a, b) => a.offset - b.offset)[0]?.rl ?? 0
}

/** Absent trailing materials never replace the deepest entered material. */
export function ermLastEnteredLayer(section: CanalSection): { index: number; material: CanalSoilStratum; bottomRl: number } | null {
  if (section.strataTopRl == null || !section.strata?.length) return null
  const strata = section.strata
  const explicit = strata.findIndex((layer) => layer.id === section.strataLastEnteredId)
  const index = explicit >= 0 ? explicit : strata.reduce((last, layer, i) => layer.thickness > 0 ? i : last, -1)
  if (index < 0) return null
  return { index, material: strata[index], bottomRl: Math.round((canalStrataTopRl(section) - strata.slice(0, index + 1).reduce((sum, layer) => sum + layer.thickness, 0)) * 1000) / 1000 }
}

export interface ErmRow {
  chainage: number
  topRl: number
  /** null means not entered / absent. */
  bottoms: (number | null)[]
  end: 'hard-rock' | 'unknown'
  /** Hard-rock bottom RL follows the same rules as every other material. null means absent. */
  hardRockBottomRl?: number | null
}

export function validateErmRow(row: ErmRow, columns = getErmColumns()): string | null {
  if (!Number.isFinite(row.chainage) || row.chainage < 0) return 'Enter a valid chainage.'
  if (!Number.isFinite(row.topRl) || row.bottoms.length !== columns.length || row.bottoms.some((rl) => rl !== null && !Number.isFinite(rl))) return 'Enter Top RL and each bottom RL, or use - for an absent layer.'
  if (row.end !== 'hard-rock' && row.end !== 'unknown') return 'Enter valid material bottom RLs.'
  let top = row.topRl
  for (let i = 0; i < row.bottoms.length; i++) {
    const bottom = row.bottoms[i]
    if (bottom === null) continue
    if (bottom > top) return `${columns[i].name}: bottom RL must be at or below the previous level.`
    top = bottom
  }
  if (row.bottoms.every((rl) => rl === null) && (row.hardRockBottomRl === null || row.hardRockBottomRl === undefined && row.end !== 'hard-rock')) return 'Enter at least one material bottom RL.'
  if (row.hardRockBottomRl !== undefined && row.hardRockBottomRl !== null && (!Number.isFinite(row.hardRockBottomRl) || row.hardRockBottomRl > top)) return 'Hard Rock: bottom RL must be at or below the previous level.'
  return null
}

export function parseErmPaste(text: string, columns = getErmColumns()): { rows: ErmRow[]; errors: string[] } {
  const rows: ErmRow[] = [], errors: string[] = []
  const seen = new Set<number>()
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return
    const cells = line.split('\t').map((cell) => cell.trim())
    if (index === 0 && /chainage/i.test(cells[0])) return
    const number = (cell: string | undefined): number => !cell ? NaN : Number(cell.replace(/,/g, ''))
    const endCell = cells[columns.length + 2] ?? ''
    const hardRockBottomRl = number(endCell)
    const hasRockLevel = Number.isFinite(hardRockBottomRl)
    const end = hasRockLevel ? 'hard-rock' : endCell === '-' || endCell === '' ? 'unknown' : null
    const row: ErmRow = { chainage: number(cells[0]), topRl: number(cells[1]), bottoms: cells.slice(2, columns.length + 2).map((cell) => cell === '-' || cell === '' ? null : number(cell)), end: end as ErmRow['end'], ...(hasRockLevel ? { hardRockBottomRl } : end !== null ? { hardRockBottomRl: null } : {}) }
    const error = cells.length !== columns.length + 3 ? `Expected ${columns.length + 3} columns: Chainage, Top RL, material bottom RLs, Hard Rock bottom RL.` : end === null ? 'Enter Hard Rock bottom RL, or - if hard rock was not reached.' : validateErmRow(row, columns)
    if (error) errors.push(`Row ${index + 1}: ${error}`)
    else if (seen.has(row.chainage)) errors.push(`Row ${index + 1}: duplicate chainage ${row.chainage}.`)
    else { rows.push(row); seen.add(row.chainage) }
  })
  return { rows, errors }
}

export function applyErmRows(data: CanalData, rows: ErmRow[]): CanalData {
  const columns = getErmColumns(data)
  if (rows.some((row) => validateErmRow(row, columns) || (data.lengthM > 0 && row.chainage > data.lengthM))) return data
  const sections = [...data.sections]
  for (const row of rows) {
    const index = sections.findIndex((section) => Math.abs(section.chainage - row.chainage) < 1e-6)
    const section: CanalSection = index >= 0 ? sections[index] : { id: `erm-${row.chainage}`, chainage: row.chainage, isManual: true, ground: [], designPopulated: false }
    let top = row.topRl
    const layers = [...columns, { id: 'erm-final-rock', name: 'Hard Rock (HR)', excavationClass: 'hr' as const }]
    const strata: CanalSoilStratum[] = layers.map((column, i) => {
      const layer = ERM_LAYERS[ERM_CLASSES.indexOf(column.excavationClass)]
      const bottom = (i === columns.length ? row.hardRockBottomRl : row.bottoms[i]) ?? top
      const thickness = Math.round((top - bottom) * 1000) / 1000
      top = bottom
      return { ...layer, name: column.name, ermClass: column.excavationClass, id: section.strata?.[i]?.id ?? `erm-${row.chainage}-${i}`, slope: section.strata?.[i]?.slope ?? layer.slope, thickness }
    })
    const entered = [...row.bottoms, row.hardRockBottomRl]
    const lastIndex = row.hardRockBottomRl === undefined && row.end === 'hard-rock' ? columns.length : entered.reduce<number>((last, rl, i) => typeof rl === 'number' ? i : last, -1)
    const next = { ...section, strataTopRl: row.topRl, strataExtent: 'continue' as const, strataLastEnteredId: strata[lastIndex]?.id, strata,
      strataHardRockBottomRl: typeof row.hardRockBottomRl === 'number' ? row.hardRockBottomRl : undefined }
    if (index >= 0) sections[index] = next
    else sections.push(next)
  }
  return { ...data, sections: sections.sort((a, b) => a.chainage - b.chainage) }
}
