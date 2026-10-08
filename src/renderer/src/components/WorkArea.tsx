import { lazy, Suspense, useEffect } from 'react'
import { useStore, useSelectedNode } from '../store/useStore'
import { findNode } from '../lib/tree'
import { findSharedOwner } from '../lib/sharedSheet'
import type { ProjectNode } from '../types/project'
import { parseGuideWallDetailId } from '../lib/guideWall'
import { parseBundDetailId } from '../lib/bund'
import { parseCanalDetailId } from '../lib/canal'
import { parseSlrbDetailId } from '../lib/slrb'
const SlrbDashboard = lazy(() => import('./slrb/SlrbDashboard'))
import HomeScreen from './home/HomeScreen'
import ClusterBreadcrumb from './cluster/ClusterBreadcrumb'
import FormulaLinkBanner from './editors/FormulaLinkBanner'
// Heavy views load on demand so startup only transforms/downloads the screen
// actually shown. The <Suspense> below covers all of them.
const NewProjectForm = lazy(() => import('./newproject/NewProjectForm'))
const TitleDashboard = lazy(() => import('./dashboard/TitleDashboard'))
const ComponentDashboard = lazy(() => import('./dashboard/ComponentDashboard'))
const GuideWallDetail = lazy(() => import('./guidewall/GuideWallDetail'))
const BundDetail = lazy(() => import('./bund/BundDetail'))
const CanalDetail = lazy(() => import('./canal/CanalDetail'))
const PageEditor = lazy(() => import('./editors/PageEditor'))
const loadItemSpreadsheet = () => import('./editors/ItemSpreadsheet')
const ItemSpreadsheet = lazy(loadItemSpreadsheet)
const RateAnalysisDashboard = lazy(() => import('./rateanalysis/RateAnalysisDashboard'))
const DataDashboard = lazy(() => import('./data/DataDashboard'))
const LeadDashboard = lazy(() => import('./lead/LeadDashboard'))
const LeadDetailDashboard = lazy(() => import('./lead/LeadDetailDashboard'))
const SeigniorageDashboard = lazy(() => import('./seigniorage/SeigniorageDashboard'))
const ClusterDashboard = lazy(() => import('./cluster/ClusterDashboard'))

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
  const slrbComponentId = parseSlrbDetailId(selectedId)
  const itemEditor = (item: ProjectNode): JSX.Element => {
    const owner = item.sharedSheetId && root ? findSharedOwner(root, item.sharedSheetId) ?? item : item
    const key = item.sharedSheetId ? `shared:${item.sharedSheetId}` : item.id
    return <ItemSpreadsheet key={key} node={owner} focusedItemId={item.id} />
  }

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
  } else if (slrbComponentId) {
    const comp = root ? findNode(root, slrbComponentId) : null
    content = comp ? <SlrbDashboard key={comp.id} node={comp} /> : <TitleDashboard />
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
      owner && owner.templateId === 'slrb' ? <SlrbDashboard key={owner.id} node={owner} /> : owner && owner.templateId === 'guide-wall' ? (
        <GuideWallDetail key={owner.id} node={owner} />
      ) : owner && owner.templateId === 'bund' ? (
        <BundDetail key={owner.id} node={owner} />
      ) : owner && owner.templateId === 'canal' ? (
        <CanalDetail key={owner.id} node={owner} />
      ) : (
        itemEditor(selected)
      )
  } else {
    content = itemEditor(selected)
  }

  return (
    <div className="workarea">
      <ClusterBreadcrumb />
      <FormulaLinkBanner />
      <Suspense fallback={<div className="workarea-loading">Loading...</div>}>{content}</Suspense>
    </div>
  )
}
