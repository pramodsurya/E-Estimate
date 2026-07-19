import { lazy, Suspense, useEffect } from 'react'
import { useStore, useSelectedNode } from '../store/useStore'
import HomeScreen from './home/HomeScreen'

const NewProjectForm = lazy(() => import('./newproject/NewProjectForm'))
const TitleDashboard = lazy(() => import('./dashboard/TitleDashboard'))
const ComponentDashboard = lazy(() => import('./dashboard/ComponentDashboard'))
const PageEditor = lazy(() => import('./editors/PageEditor'))
const loadItemSpreadsheet = () => import('./editors/ItemSpreadsheet')
const ItemSpreadsheet = lazy(loadItemSpreadsheet)
const RateAnalysisDashboard = lazy(() => import('./rateanalysis/RateAnalysisDashboard'))
const DtlLeadDashboard = lazy(() => import('./lead/DtlLeadDashboard'))
const LeadDetailDashboard = lazy(() => import('./lead/LeadDetailDashboard'))
const SeigniorageDashboard = lazy(() => import('./seigniorage/SeigniorageDashboard'))

export default function WorkArea(): JSX.Element {
  const view = useStore((s) => s.view)
  const activity = useStore((s) => s.activity)
  const analysisSelection = useStore((s) => s.analysisSelection)
  const leadSelection = useStore((s) => s.leadSelection)
  const seigniorageSelection = useStore((s) => s.seigniorageSelection)
  const selected = useSelectedNode()

  useEffect(() => {
    if (view === 'home' || view === 'newproject') return
    const timer = window.setTimeout(() => {
      void loadItemSpreadsheet()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [view])

  let content: JSX.Element
  if (view === 'home') {
    content = <HomeScreen />
  } else if (view === 'newproject') {
    content = <NewProjectForm />
  } else if (activity === 'lead') {
    content = <DtlLeadDashboard />
  } else if (leadSelection) {
    content = <LeadDetailDashboard />
  } else if (seigniorageSelection) {
    content = <SeigniorageDashboard />
  } else if (analysisSelection) {
    content = <RateAnalysisDashboard />
  } else if (!selected || selected.kind === 'title') {
    content = <TitleDashboard />
  } else if (selected.kind === 'component' || selected.kind === 'subcomponent') {
    content = <ComponentDashboard node={selected} />
  } else if (selected.kind === 'page') {
    content = <PageEditor node={selected} />
  } else {
    content = <ItemSpreadsheet key={selected.id} node={selected} />
  }

  return (
    <div className="workarea">
      <Suspense fallback={<div className="workarea-loading">Loading...</div>}>{content}</Suspense>
    </div>
  )
}
