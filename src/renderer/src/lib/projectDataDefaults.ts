import type { EestimateProject, ProjectDataDefinition, SorZone } from '../types/project'
import { projectDataUsesTimelyRates } from './projectDataRateLinks'

export const M25_WEARING_DATA_KEY = 'm25-wearing-coat' as const
export const M25_WEARING_SOURCE_CODE = 'IRR-CCDW-2-29'
export const M25_WEARING_MIX_CODE = 'IRR-DAW-2-19'

export function nextProjectDataCode(definitions: ProjectDataDefinition[]): string {
  const highest = definitions.reduce((max, definition) => {
    const match = /^DATA-SOR-(\d+)$/i.exec(definition.code.trim())
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `DATA-SOR-${String(highest + 1).padStart(3, '0')}`
}

/** Available in every project, independently of its components or templates. */
export function ensureBuiltInProjectData(project: EestimateProject): EestimateProject {
  const definitions = project.projectData ?? []
  if (definitions.some((definition) =>
    definition.kind === 'ssr' && definition.builtIn?.key === M25_WEARING_DATA_KEY
  )) return project
  const now = new Date().toISOString()
  return {
    ...project,
    projectData: [...definitions, {
      id: `${project.id}:builtin:${M25_WEARING_DATA_KEY}`,
      code: nextProjectDataCode(definitions),
      kind: 'ssr',
      timelyRates: true,
      timelyOverhead: true,
      rateSource: { itemSource: 'SSR', itemCode: M25_WEARING_SOURCE_CODE, categoryKey: 'ssr_item' },
      description: 'M25 concrete wearing coat with 20 mm down aggregate',
      unit: 'CUM',
      // No catalogue quantity or rate is guessed before a year is selected.
      outputQuantity: 1,
      overheadPercent: 0,
      sections: [],
      lead: { applicable: false },
      builtIn: {
        key: M25_WEARING_DATA_KEY,
        sourceItemCode: M25_WEARING_SOURCE_CODE,
        mixItemCode: M25_WEARING_MIX_CODE,
        initialized: false,
        rateStatus: 'pending'
      },
      createdAt: now,
      updatedAt: now
    }]
  }
}

export function projectDataRatesReady(
  definition: ProjectDataDefinition,
  year: string,
  zone: SorZone
): boolean {
  if (!projectDataUsesTimelyRates(definition)) return true
  if (definition.rateRefresh) return definition.rateRefresh.status === 'ready' &&
    definition.rateRefresh.year === year && definition.rateRefresh.zone === zone
  if (definition.kind !== 'ssr' || !definition.builtIn) return false
  return definition.builtIn.initialized && definition.builtIn.rateStatus === 'ready' &&
    definition.builtIn.resolvedYear === year && definition.builtIn.resolvedZone === zone
}
