import { useStore } from '../store/useStore'
import DataPanel from './data/DataPanel'
import ExplorerPanel from './explorer/ExplorerPanel'
import LeadSidebarPanel from './lead/LeadSidebarPanel'
import SearchPanel from './search/SearchPanel'
import SourceControlPanel from './sourcecontrol/SourceControlPanel'

export default function SideBar(): JSX.Element {
  const activity = useStore((state) => state.activity)
  const dataDashboardSection = useStore((state) => state.dataDashboardSection)
  const setDataDashboardSection = useStore((state) => state.setDataDashboardSection)
  const projectDataCount = useStore((state) => state.project?.projectData?.length ?? 0)
  const materialRateCount = useStore(
    (state) => Object.keys(state.project?.meta.materialRateOverrides ?? {}).length
  )
  return (
    <div className="sidebar">
      <div className="sidebar-top">
        {activity === 'explorer' && <ExplorerPanel />}
        {activity === 'search' && <SearchPanel />}
        {activity === 'lead' && <LeadSidebarPanel />}
        {activity === 'data' && (
          <div className="data-sidebar-panel">
            <button
              type="button"
              className={`data-sidebar-dashboard ${dataDashboardSection === 'dashboard' ? 'active' : ''}`}
              onClick={() => setDataDashboardSection('dashboard')}
            >
              Dashboard
            </button>
            <button
              type="button"
              className={`data-sidebar-link ${dataDashboardSection === 'created' ? 'active' : ''}`}
              onClick={() => setDataDashboardSection('created')}
            >
              <span>Created DATA</span>
              <small>{projectDataCount}</small>
            </button>
            <button
              type="button"
              className={`data-sidebar-link ${dataDashboardSection === 'catalogue' ? 'active' : ''}`}
              onClick={() => setDataDashboardSection('catalogue')}
            >
              SOR / SSR DATA
            </button>
            <button
              type="button"
              className={`data-sidebar-link ${dataDashboardSection === 'rates' ? 'active' : ''}`}
              onClick={() => setDataDashboardSection('rates')}
            >
              <span>Cement / Steel</span>
              {materialRateCount > 0 && <small>{materialRateCount}</small>}
            </button>
          </div>
        )}
        {activity === 'sourcecontrol' && <SourceControlPanel />}
      </div>
      <div className="sidebar-bottom">
        <DataPanel />
      </div>
    </div>
  )
}
