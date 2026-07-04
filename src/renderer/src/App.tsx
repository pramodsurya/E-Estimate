import { lazy, Suspense, useEffect } from 'react'
import { useStore } from './store/useStore'
import TitleBar from './components/TitleBar'
import ActivityBar from './components/ActivityBar'
import SideBar from './components/SideBar'
import WorkArea from './components/WorkArea'
import UpdateNotification from './components/UpdateNotification'

const AddItemModal = lazy(() => import('./components/modals/AddItemModal'))
const AddPageModal = lazy(() => import('./components/modals/AddPageModal'))
const AddStructureModal = lazy(() => import('./components/modals/AddStructureModal'))
const SettingsModal = lazy(() => import('./components/modals/SettingsModal'))

export default function App(): JSX.Element {
  const view = useStore((s) => s.view)
  const loadRecent = useStore((s) => s.loadRecent)
  const addItemOpen = useStore((s) => s.addItem.open)
  const addPageOpen = useStore((s) => s.addPage.open)
  const addStructureOpen = useStore((s) => s.addStructure.open)
  const settingsOpen = useStore((s) => s.settings.open)

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  const showShell = view !== 'home'

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        {showShell && <ActivityBar />}
        {showShell && <SideBar />}
        <WorkArea />
      </div>
      <Suspense fallback={null}>
        {addItemOpen && <AddItemModal />}
        {addPageOpen && <AddPageModal />}
        {addStructureOpen && <AddStructureModal />}
        {settingsOpen && <SettingsModal />}
      </Suspense>

      {/* Auto-update toast notification */}
      <UpdateNotification />
    </div>
  )
}
