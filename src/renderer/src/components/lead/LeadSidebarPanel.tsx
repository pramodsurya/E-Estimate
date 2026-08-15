import { ChevronRight, Layers3, Link2, Route } from 'lucide-react'
import { dashboardContextMatches } from '../../lib/dashboardSync'
import { conveyanceClassLabel } from '../../lib/lead'
import {
  canonicalLeadMaterialRef,
  materialRefsForLeadInfo,
  parseLeadInfo
} from '../../lib/leadApplicability'
import { projectDataForNode, projectDataLeadApplicability } from '../../lib/projectData'
import { projectItemGroups } from '../../lib/projectItems'
import { useStore } from '../../store/useStore'
import type { ConveyanceClass, PipeLeadSource } from '../../types/project'

interface MaterialSummary {
  key: string
  name: string
  conveyanceClass: ConveyanceClass
  variants: number
  applications: number
  pipeLead?: PipeLeadSource
}

export default function LeadSidebarPanel(): JSX.Element {
  const project = useStore((state) => state.project)
  const setActivity = useStore((state) => state.setActivity)
  const openLeadMaterial = useStore((state) => state.openLeadMaterial)
  const snapshotValid = project
    ? dashboardContextMatches(project.dashboardSnapshot, project)
    : false
  const variants = snapshotValid
    ? project?.dashboardSnapshot?.leadDashboardEntries ?? []
    : []
  const materialsByKey = new Map<string, MaterialSummary>()

  for (const variant of variants) {
    // Old snapshots may pre-date a backend class correction. Normalizing here keeps
    // the sidebar truthful immediately; the next Dashboard Sync persists the recipe.
    const canonical = canonicalLeadMaterialRef({
      name: variant.materialName,
      conveyanceClass: variant.conveyanceClass,
      source: ''
    })
    const key = `${canonical.name.trim().toLowerCase()}:${canonical.conveyanceClass}`
    const material = materialsByKey.get(key) ?? {
      key,
      name: canonical.name,
      conveyanceClass: canonical.conveyanceClass,
      variants: 0,
      applications: 0,
      pipeLead: variant.pipeLead
    }
    material.variants += 1
    material.applications += variant.applications.length
    materialsByKey.set(key, material)
  }

  if (project) {
    for (const group of projectItemGroups(project.root)) {
      if (group.source !== 'PROJECT_DATA') continue
      const definition = projectDataForNode(project.projectData, group.usages[0]?.node)
      if (!definition) continue
      for (const ref of materialRefsForLeadInfo(
        parseLeadInfo(projectDataLeadApplicability(definition)),
        group.description
      )) {
        const key = `${ref.name.trim().toLowerCase()}:${ref.conveyanceClass}`
        if (materialsByKey.has(key)) continue
        materialsByKey.set(key, {
          key,
          name: ref.name,
          conveyanceClass: ref.conveyanceClass,
          variants: 0,
          applications: 0
        })
      }
    }
  }

  const materials = Array.from(materialsByKey.values()).sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { numeric: true })
  )
  const applicationCount = variants.reduce(
    (total, variant) => total + variant.applications.length,
    0
  )

  return (
    <div className="lead-sidebar-panel">
      <div className="lead-sidebar-hero">
        <div className="lead-sidebar-hero-icon">
          <Route size={18} />
        </div>
        <div>
          <span>Lead workspace</span>
          <strong>Materials & routes</strong>
        </div>
        <button type="button" onClick={() => setActivity('lead')}>
          Dashboard
        </button>
      </div>

      <div className="lead-sidebar-summary" aria-label="Lead summary">
        <div>
          <Layers3 size={13} />
          <strong>{materials.length}</strong>
          <span>Materials</span>
        </div>
        <div>
          <Route size={13} />
          <strong>{variants.length}</strong>
          <span>Variants</span>
        </div>
        <div>
          <Link2 size={13} />
          <strong>{applicationCount}</strong>
          <span>Linked</span>
        </div>
      </div>

      <div className="lead-sidebar-section-title">
        <span>Synced materials</span>
        <small>{materials.length}</small>
      </div>

      <div className="lead-sidebar-list">
        {materials.length === 0 ? (
          <div className="lead-sidebar-empty">
            <Route size={20} />
            <strong>No synced materials</strong>
            <span>Open the Lead Dashboard and click Sync to build this list.</span>
          </div>
        ) : (
          materials.map((material) => (
            <button
              type="button"
              className="lead-sidebar-row"
              key={material.key}
              onClick={() =>
                openLeadMaterial({
                    materialName: material.name,
                    conveyanceClass: material.conveyanceClass,
                    pipeLead: material.pipeLead
                })
              }
            >
              <span className="lead-sidebar-material-mark">
                {material.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="lead-sidebar-material-copy">
                <strong>{material.name}</strong>
                <small>{conveyanceClassLabel(material.conveyanceClass)}</small>
                <small>
                  {material.variants} variant{material.variants === 1 ? '' : 's'} ·{' '}
                  {material.applications} linked
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))
        )}
      </div>
    </div>
  )
}
