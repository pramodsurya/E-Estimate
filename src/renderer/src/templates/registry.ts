// Component template registry. Each entry turns a component node into a
// purpose-built dashboard; future templates (Box Culvert, Weir, Sluice) are
// added here and picked in the Add Component modal.

import type { ComponentTemplateId } from '../types/project'

export interface ComponentTemplateDef {
  id: ComponentTemplateId
  name: string
  description: string
}

export const COMPONENT_TEMPLATES: ComponentTemplateDef[] = [
  {
    id: 'guide-wall',
    name: 'Guide Wall',
    description:
      'Wall on a base slab along a chainage. Typical sections per reach, auto concrete quantities, manual excavation sheet.'
  },
  {
    id: 'bund',
    name: 'Small Earthen Bund',
    description:
      'Repair of a small earthen tank bund. Cross-section per chainage, proposed bund auto-drawn from the tank levels, Mean Sectional Area quantities for stripping, formation and rolling, with a to-scale section drawing.'
  }
]

export function templateName(id: ComponentTemplateId | undefined): string | null {
  if (!id) return null
  return COMPONENT_TEMPLATES.find((t) => t.id === id)?.name ?? null
}
