import type { CanalData, CanalSection } from '../types/project'
import { applyErmRows, getErmColumns, validateErmRow, type ErmRow } from './canalErm'
import { canalDesignProfile, canalGroundProfileBetweenToes, orderCanalPoints } from './canal'

/** Save investigation levels only. Section geometry is populated in Sections. */
export function saveCanalStrataRows(data: CanalData, rows: ErmRow[]): CanalData {
  if (!rows.length || rows.some((row) => validateErmRow(row, getErmColumns(data)) || (data.lengthM > 0 && row.chainage > data.lengthM))) return data
  return applyErmRows(data, rows)
}

/** Explicit ground/toe levels take precedence; saved geological Top RL fills blanks. */
export function canalSectionEntryGround(section: CanalSection): { left: number; right: number } | null {
  const finite = (value: number | undefined | null): number | null => Number.isFinite(value) ? value as number : null
  const points = orderCanalPoints(section.ground)
  const top = finite(section.strataTopRl)
  const left = finite(section.leftToeRl) ?? points[0]?.rl ?? top
  const separate = section.groundEntryMode === 'separate' || (section.groundEntryMode == null && points.length >= 2 && points[0].rl !== points.at(-1)!.rl)
  const right = separate ? finite(section.rightToeRl) ?? points.at(-1)?.rl ?? top : left
  return left == null || right == null ? null : { left, right }
}

export function populateCanalSectionGround(data: CanalData, section: CanalSection, left: number, right: number): CanalSection {
  const candidate: CanalSection = {
    ...section, ground: canalGroundProfileBetweenToes(data, section, left, right),
    groundEntryMode: left === right ? 'average' : 'separate', leftToeRl: left, rightToeRl: right, designPopulated: true
  }
  const offsets = canalDesignProfile(data, candidate).map(point => Math.round(point.offset * 1000) / 1000)
  return { ...candidate, designPointOffsets: [...new Set(offsets)].sort((a, b) => a - b) }
}

/** Populate selected chainages from their own saved levels, preserving surveyed profiles. */
export function populateCanalSelectedSections(data: CanalData, ids: ReadonlySet<string>): { data: CanalData; populated: number; skipped: number } {
  let populated = 0, skipped = 0
  const sections = data.sections.map(section => {
    if (!ids.has(section.id)) return section
    const ground = canalSectionEntryGround(section)
    if (!ground) { skipped++; return section }
    populated++
    if (orderCanalPoints(section.ground).length > 2) {
      const candidate = { ...section, designPopulated: true }
      const offsets = canalDesignProfile(data, candidate).map(point => Math.round(point.offset * 1000) / 1000)
      return { ...candidate, designPointOffsets: [...new Set(offsets)].sort((a, b) => a - b) }
    }
    return populateCanalSectionGround(data, section, ground.left, ground.right)
  })
  return { data: { ...data, sections }, populated, skipped }
}
