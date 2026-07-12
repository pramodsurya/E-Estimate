import { lazy, Suspense, useEffect, useRef } from 'react'
import { persistProjectSession, useStore } from './store/useStore'
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
  const restoreLastSession = useStore((s) => s.restoreLastSession)
  const project = useStore((s) => s.project)
  const filePath = useStore((s) => s.filePath)
  const dirty = useStore((s) => s.dirty)
  const selectedId = useStore((s) => s.selectedId)
  const expanded = useStore((s) => s.expanded)
  const activity = useStore((s) => s.activity)
  const analysisSelection = useStore((s) => s.analysisSelection)
  const leadSelection = useStore((s) => s.leadSelection)
  const seigniorageSelection = useStore((s) => s.seigniorageSelection)
  const restoreStarted = useRef(false)
  const addItemOpen = useStore((s) => s.addItem.open)
  const addPageOpen = useStore((s) => s.addPage.open)
  const addStructureOpen = useStore((s) => s.addStructure.open)
  const settingsOpen = useStore((s) => s.settings.open)

  useEffect(() => {
    if (restoreStarted.current) return
    restoreStarted.current = true
    void loadRecent()
    void restoreLastSession()
  }, [loadRecent, restoreLastSession])

  useEffect(() => {
    if (!filePath) return
    persistProjectSession(filePath, {
      selectedId,
      expanded,
      activity,
      analysisSelection,
      leadSelection,
      seigniorageSelection
    })
  }, [
    filePath,
    selectedId,
    expanded,
    activity,
    analysisSelection,
    leadSelection,
    seigniorageSelection
  ])

  useEffect(() => {
    if (!project || !filePath || !dirty) return
    const handle = window.setTimeout(() => {
      void useStore.getState().saveProject().catch(() => undefined)
    }, 1200)
    return () => window.clearTimeout(handle)
  }, [project, filePath, dirty])

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
