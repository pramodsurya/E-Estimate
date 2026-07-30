/**
 * Project print layout settings. Kept apart from `projectPrint` so screens that
 * only read the settings do not pull in the inlined emblem artwork.
 */

import type { Margins, Orientation, PaperSize } from '../types/project'

const DEFAULT_MARGINS: Margins = { top: 20, right: 15, bottom: 20, left: 25 }

export type ProjectPrintSectionKey =
  | 'cover'
  | 'introduction'
  | 'abstract'
  | 'components'
  | 'seigniorage'
  | 'lead'
  | 'data'

export interface ProjectPrintSettings {
  pageSize: PaperSize
  orientation: Orientation
  margins: Margins
  /** Report font scale, as a percentage. */
  fontPercent: number
  sections: Record<ProjectPrintSectionKey, boolean>
}

export const DEFAULT_PROJECT_PRINT_SETTINGS: ProjectPrintSettings = {
  pageSize: 'A4',
  orientation: 'portrait',
  margins: DEFAULT_MARGINS,
  fontPercent: 100,
  sections: {
    cover: true,
    introduction: true,
    abstract: true,
    components: true,
    seigniorage: true,
    lead: true,
    data: true
  }
}

export function resolveProjectPrintSettings(
  stored?: Partial<ProjectPrintSettings>
): ProjectPrintSettings {
  return {
    ...DEFAULT_PROJECT_PRINT_SETTINGS,
    ...(stored ?? {}),
    margins: { ...DEFAULT_MARGINS, ...(stored?.margins ?? {}) },
    sections: { ...DEFAULT_PROJECT_PRINT_SETTINGS.sections, ...(stored?.sections ?? {}) }
  }
}
