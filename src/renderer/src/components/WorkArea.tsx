import { lazy, Suspense, useEffect } from 'react'
import { useStore, useSelectedNode } from '../store/useStore'
import { findNode } from '../lib/tree'
import { parseGuideWallDetailId } from '../lib/guideWall'
import { parseBundDetailId } from '../lib/bund'
import { parseCanalDetailId } from '../lib/canal'
import HomeScreen from './home/HomeScreen'
import ClusterBreadcrumb from './cluster/ClusterBreadcrumb'
import NewProjectForm from './newproject/NewProjectForm'
import TitleDashboard from './dashboard/TitleDashboard'
import ComponentDashboard from './dashboard/ComponentDashboard'
import GuideWallDetail from './guidewall/GuideWallDetail'
import BundDetail from './bund/BundDetail'
import CanalDetail from './canal/CanalDetail'
import PageEditor from './editors/PageEditor'
const loadItemSpreadsheet = () => import('./editors/ItemSpreadsheet')
const ItemSpreadsheet = lazy(loadItemSpreadsheet)
import RateAnalysisDashboard from './rateanalysis/RateAnalysisDashboard'
import DataDashboard from './data/DataDashboard'
import LeadDashboard from './lead/LeadDashboard'
import LeadDetailDashboard from './lead/LeadDetailDashboard'
import SeigniorageDashboard from './seigniorage/SeigniorageDashboard'
import ClusterDashboard from './cluster/ClusterDashboard'

export default function WorkArea(): JSX.Element {
  const view = useStore((s) => s.view)
  const activity = useStore((s) => s.activity)
  const analysisSelection = useStore((s) => s.analysisSelection)
  const leadSelection = useStore((s) => s.leadSelection)
  const seigniorageSelection = useStore((s) => s.seigniorageSelection)
  const selectedId = useStore((s) => s.selectedId)
  const root = useStore((s) => s.project?.root ?? null)
  const selected = useSelectedNode()
  const detailComponentId = parseGuideWallDetailId(selectedId)
  const bundDetailComponentId = parseBundDetailId(selectedId)
  const canalDetailComponentId = parseCanalDetailId(selectedId)

  useEffect(() => {
    if (view === 'home' || view === 'newproject') return
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(
        () => {
          void loadItemSpreadsheet()
        },
        { timeout: 3500 }
      )
      return () => window.cancelIdleCallback(handle)
    }
    const timer = window.setTimeout(() => {
      void loadItemSpreadsheet()
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [view])

  let content: JSX.Element
  if (view === 'home') {
    content = <HomeScreen />
  } else if (view === 'cluster') {
    content = <ClusterDashboard />
  } else if (view === 'newproject') {
    content = <NewProjectForm />
  } else if (leadSelection) {
    content = <LeadDetailDashboard />
  } else if (seigniorageSelection) {
    content = <SeigniorageDashboard />
  } else if (analysisSelection) {
    content = <RateAnalysisDashboard />
  } else if (activity === 'lead') {
    content = <LeadDashboard />
  } else if (activity === 'data') {
    content = <DataDashboard />
  } else if (detailComponentId) {
    // The synthetic "Detailed" tree row under a Guide Wall component.
    const comp = root ? findNode(root, detailComponentId) : null
    content = comp ? <GuideWallDetail key={comp.id} node={comp} /> : <TitleDashboard />
  } else if (bundDetailComponentId) {
    // The same synthetic row under a Bund component.
    const comp = root ? findNode(root, bundDetailComponentId) : null
    content = comp ? <BundDetail key={comp.id} node={comp} /> : <TitleDashboard />
  } else if (canalDetailComponentId) {
    // The same synthetic row under a Canal component.
    const comp = root ? findNode(root, canalDetailComponentId) : null
    content = comp ? <CanalDetail key={comp.id} node={comp} /> : <TitleDashboard />
  } else if (!selected || selected.kind === 'title') {
    content = <TitleDashboard />
  } else if (selected.kind === 'component' || selected.kind === 'subcomponent') {
    content = <ComponentDashboard node={selected} />
  } else if (selected.kind === 'page') {
    content = <PageEditor key={selected.id} node={selected} />
  } else if (selected.templateGenerated && selected.templateOwnerId && root) {
    // A generated CCDW item (reachable from the Overview cost list) opens the
    // owning component's Detailed dashboard rather than a spreadsheet.
    const owner = findNode(root, selected.templateOwnerId)
    content =
      owner && owner.templateId === 'guide-wall' ? (
        <GuideWallDetail key={owner.id} node={owner} />
      ) : owner && owner.templateId === 'bund' ? (
        <BundDetail key={owner.id} node={owner} />
      ) : owner && owner.templateId === 'canal' ? (
        <CanalDetail key={owner.id} node={owner} />
      ) : (
        <ItemSpreadsheet key={selected.id} node={selected} />
      )
  } else {
    content = <ItemSpreadsheet key={selected.id} node={selected} />
  }

  return (
    <div className="workarea">
      <ClusterBreadcrumb />
      <Suspense fallback={<div className="workarea-loading">Loading...</div>}>{content}</Suspense>
    </div>
  )
}
