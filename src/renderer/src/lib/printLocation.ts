/**
 * Smart print location for the Cover page and the General Abstract
 * (Project page) — print (Typst) and Excel export only, nowhere else.
 *
 * Rule agreed with the estimator:
 * - Point works and stretch works (canal, bund, guide wall, custom) alike are
 *   judged from the components' own location data — whatever length the user
 *   chose. No length threshold decides "big" vs "small".
 * - Every component/sub-component contributes its effective place: its own
 *   area allowance, else the nearest component ancestor's, else the project
 *   allowance. Components with no data at all are skipped.
 * - Village is the main key: more than one distinct village means different
 *   places. A shared village then requires a shared mandal and district.
 * - Same place → print village/mandal/district. Different places → all three
 *   resolve to '' so every consumer omits the location entirely (no blank
 *   rows, no underscore fillers, no reserved space).
 * - No component data anywhere → legacy project-level values (unchanged).
 *
 * This module is deliberately dependency-free (types + place names only) so
 * the Typst payload builders, both Excel wires, and the other AI working on
 * the Excel export can all share it without import cycles.
 */
import type { EestimateProject, ProjectAreaAllowance, ProjectNode } from '../types/project'
import { normalizePlaceName } from './placeNormalization'

export interface ProjectPrintLocation {
  /** False when components sit in different places: consumers must omit location. */
  samePlace: boolean
  village: string
  mandal: string
  district: string
}

function isWorkNode(node: ProjectNode): boolean {
  return node.kind === 'component' || node.kind === 'subcomponent'
}

function walkWorkNodes(
  node: ProjectNode,
  inherited: ProjectAreaAllowance | null | undefined,
  out: Array<{ allowance: ProjectAreaAllowance | null | undefined }>
): void {
  const current = isWorkNode(node) ? (node.areaAllowance ?? inherited) : inherited
  if (isWorkNode(node)) out.push({ allowance: current })
  for (const child of node.children ?? []) walkWorkNodes(child, current, out)
}

function placeOf(allowance: ProjectAreaAllowance | null | undefined): {
  village: string
  mandal: string
  district: string
} {
  return {
    village: normalizePlaceName(allowance?.village),
    mandal: normalizePlaceName(allowance?.mandal),
    district: normalizePlaceName(allowance?.district)
  }
}

function single(values: Set<string>): string {
  return values.size === 1 ? [...values][0] ?? '' : ''
}

export function resolveProjectPrintLocation(project: EestimateProject): ProjectPrintLocation {
  const meta = project.meta.areaAllowance
  const collected: Array<{ allowance: ProjectAreaAllowance | null | undefined }> = []
  if (project.root) walkWorkNodes(project.root, meta ?? null, collected)

  const places = collected
    .map((entry) => placeOf(entry.allowance))
    .filter((place) => place.village !== '' || place.mandal !== '' || place.district !== '')

  if (places.length === 0) {
    return {
      samePlace: true,
      village: normalizePlaceName(meta?.village),
      mandal: normalizePlaceName(meta?.mandal),
      district: normalizePlaceName(meta?.district || project.meta.location?.label)
    }
  }

  const villages = new Set(places.map((place) => place.village).filter((value) => value !== ''))
  const mandals = new Set(places.map((place) => place.mandal).filter((value) => value !== ''))
  const districts = new Set(places.map((place) => place.district).filter((value) => value !== ''))
  if (villages.size > 1 || mandals.size > 1 || districts.size > 1) {
    return { samePlace: false, village: '', mandal: '', district: '' }
  }
  return {
    samePlace: true,
    village: single(villages),
    mandal: single(mandals),
    district: single(districts)
  }
}
