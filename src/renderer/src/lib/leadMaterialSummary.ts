import { dashboardContextMatches, dashboardRecipeForNode } from './dashboardSync'
import { canonicalLeadMaterialRef, isDisposalLeadMaterial, materialRefsForLeadInfo, parseLeadInfo, type LeadMaterialRef } from './leadApplicability'
import { leadMetadataForGroup } from './leadWorkspace'
import { pipeLeadMaterialName } from './pipeLead'
import { projectDataForNode, projectDataLeadApplicability } from './projectData'
import { projectItemGroups, type ProjectItemGroup } from './projectItems'
import type { EestimateProject, ConveyanceClass, LeadApplication, LeadVariant, PipeLeadSource } from '../types/project'
import type { RateAnalysisRecipe } from '../types/rateAnalysis'

export interface LeadAbstractItem {
  key: string
  name: string
  conveyanceClass: ConveyanceClass
  dataCount: number
  variantCount: number
  linkedCount: number
  amount: number
  pipeLead?: PipeLeadSource
}

/** Both Lead navigation panels use live routes and the same DATA/appendix inventory. */
export function projectLeadMaterials(project: EestimateProject): LeadAbstractItem[] {
  const groups = projectItemGroups(project.root)
  const snapshot = dashboardContextMatches(project.dashboardSnapshot, project) ? project.dashboardSnapshot : undefined
  const recipes = Object.fromEntries(groups.flatMap(group => group.usages.flatMap(({ node }) => {
    const recipe = dashboardRecipeForNode(project, snapshot, node)
    return recipe ? [[node.id, recipe]] : []
  })))
  return buildLeadAbstract(groups.map(group => {
    const definition = group.source === 'PROJECT_DATA' ? projectDataForNode(project.projectData, group.usages[0]?.node) : undefined
    const metadata = definition ? projectDataLeadApplicability(definition) : snapshot?.leadApplicability?.[group.code]
    return {
      code: group.code, description: group.description, source: group.source,
      metadata: leadMetadataForGroup(group, metadata, recipes),
      pipeLead: pipeLeadForGroup(group, recipes)
    }
  }), project.leadChart?.variants ?? [], project.leadChart?.applications ?? [])
}

export function buildLeadAbstract(
  dataRows: Array<{
    code: string
    description: string
    metadata: unknown
    source: string
    pipeLead?: PipeLeadSource
  }>,
  variants: LeadVariant[],
  applications: LeadApplication[]
): LeadAbstractItem[] {
  const byKey = new Map<string, LeadAbstractItem>()

  const ensure = (ref: LeadMaterialRef, pipeLead?: PipeLeadSource): LeadAbstractItem => {
    const canonical = canonicalLeadMaterialRef(ref)
    const key = pipeLead
      ? `pipe:${pipeLead.pipeLeadItemCode}`
      : isDisposalLeadMaterial(canonical.name)
      ? `disposal:${canonical.name.toLowerCase()}`
      : `${canonical.conveyanceClass}:${canonical.name.toLowerCase()}`
    let item = byKey.get(key)
    if (!item) {
      item = {
        key,
        name: canonical.name,
        conveyanceClass: canonical.conveyanceClass,
        dataCount: 0,
        variantCount: 0,
        linkedCount: 0,
        amount: 0,
        pipeLead
      }
      byKey.set(key, item)
    }
    return item
  }

  for (const row of dataRows) {
    if (row.pipeLead) {
      ensure({
        name: pipeLeadMaterialName(row.pipeLead),
        conveyanceClass: 'RCC_PIPE',
        source: row.pipeLead.pipeLeadCatalogueCode
      }, row.pipeLead).dataCount += 1
      continue
    }
    if (!['SSR','SOR','PROJECT_DATA','MORTH'].includes(row.source)) continue
    for (const ref of materialRefsForLeadInfo(parseLeadInfo(row.metadata), row.description)) {
      ensure(ref).dataCount += 1
    }
  }

  for (const variant of variants) {
    ensure(
      { name: variant.materialName, conveyanceClass: variant.conveyanceClass, source: '' },
      variant.pipeLead
    )
      .variantCount += 1
  }

  for (const application of applications) {
    const variant = variants.find((candidate) => candidate.id === application.variantId)
    if (!variant) continue
    const item = ensure(
      {
        name: variant.materialName,
        conveyanceClass: variant.conveyanceClass,
        source: ''
      },
      variant.pipeLead
    )
    item.linkedCount += 1
    item.amount += application.grossAmount * (application.morthRootFactor ?? 1)
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  )
}

function pipeLeadForGroup(
  group: ProjectItemGroup,
  recipes: Record<string, RateAnalysisRecipe> | undefined
): PipeLeadSource | undefined {
  for (const usage of group.usages) {
    const linked =
      usage.node.sorCatalogue?.pipeLead ??
      recipes?.[usage.node.id]?.sorCatalogueSource?.pipeLead
    if (linked) return linked
  }
  return undefined
}
