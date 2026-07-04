import { useStore } from '../store/useStore'
import DataPanel from './data/DataPanel'
import ExplorerPanel from './explorer/ExplorerPanel'
import LeadSidebarPanel from './lead/LeadSidebarPanel'
import SearchPanel from './search/SearchPanel'
import SourceControlPanel from './sourcecontrol/SourceControlPanel'

export default function SideBar(): JSX.Element {
  const activity = useStore((state) => state.activity)
  return (
    <div className="sidebar">
      <div className="sidebar-top">
        {activity === 'explorer' && <ExplorerPanel />}
        {activity === 'search' && <SearchPanel />}
        {activity === 'lead' && <LeadSidebarPanel />}
        {activity === 'sourcecontrol' && <SourceControlPanel />}
      </div>
      <div className="sidebar-bottom">
        <DataPanel />
      </div>
    </div>
  )
}
