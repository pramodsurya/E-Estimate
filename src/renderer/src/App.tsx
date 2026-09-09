import { lazy, Suspense, useEffect, useRef } from 'react'
import { persistProjectSession, useStore } from './store/useStore'
import TitleBar from './components/TitleBar'
import ActivityBar from './components/ActivityBar'
import SideBar from './components/SideBar'
import WorkArea from './components/WorkArea'
import UpdateNotification from './components/UpdateNotification'
import ErrorBoundary from './components/ErrorBoundary'
import TutorialOverlay from './components/tutorial/TutorialOverlay'

const AddItemModal = lazy(() => import('./components/modals/AddItemModal'))
const AddPageModal = lazy(() => import('./components/modals/AddPageModal'))
const AddStructureModal = lazy(() => import('./components/modals/AddStructureModal'))
const SettingsModal = lazy(() => import('./components/modals/SettingsModal'))

/**
 * A project with nowhere to be written is not being saved.
 *
 * The autosave is gated on the project having a file. One is asked for the
 * moment a project is created, but that can be cancelled — and a quiet failure
 * to save is the one thing an estimator must never discover afterwards. So it
 * is said, on every screen, until there is a file.
 */
function UnsavedProjectNotice(): JSX.Element | null {
  const hasProject = useStore((state) => Boolean(state.project))
  const filePath = useStore((state) => state.filePath)
  const saveProjectAs = useStore((state) => state.saveProjectAs)
  if (!hasProject || filePath) return null
  return (
    <div className="unsaved-project-notice">
      <span>
        <strong>This project has not been saved yet.</strong> Nothing you enter is being kept
        — choose where it should live and it saves itself from then on.
      </span>
      <button className="btn" onClick={() => void saveProjectAs()}>
        Save project
      </button>
    </div>
  )
}

/**
 * Keep autosave subscriptions below the application shell. Project identity
 * changes on every editor update; subscribing in App made every keystroke
 * rerender TitleBar, sidebars, WorkArea and all open dashboard content before
 * the browser could deliver the next keyboard event.
 */
function ProjectAutosaveController(): null {
  const projectRevision = useStore((state) => state.project?.updatedAt ?? null)
  const filePath = useStore((state) => state.filePath)
  const dirty = useStore((state) => state.dirty)

  useEffect(() => {
    if (!projectRevision || !filePath || !dirty) return
    const handle = window.setTimeout(() => {
      void useStore.getState().saveProject().catch(() => undefined)
    }, 1200)
    return () => window.clearTimeout(handle)
  }, [projectRevision, filePath, dirty])

  return null
}

export default function App(): JSX.Element {
  const view = useStore((s) => s.view)
  const loadRecent = useStore((s) => s.loadRecent)
  const restoreLastSession = useStore((s) => s.restoreLastSession)
  const filePath = useStore((s) => s.filePath)
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

  useEffect(
    () =>
      window.api.bund.onProgress((progress) => {
        useStore.getState().updateBundSimulationProgress(progress)
      }),
    []
  )

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

  const showShell = view !== 'home'

  return (
    <div className="app">
      <ProjectAutosaveController />
      <TitleBar />
      {showShell && <UnsavedProjectNotice />}
      <div className="app-body">
        {showShell && <ActivityBar />}
        {showShell && <SideBar />}
        <ErrorBoundary
          label="this view"
          resetKeys={[view, activity, selectedId, analysisSelection, leadSelection, seigniorageSelection]}
        >
          <WorkArea />
        </ErrorBoundary>
      </div>
      <ErrorBoundary
        label="this dialog"
        resetKeys={[addItemOpen, addPageOpen, addStructureOpen, settingsOpen]}
      >
        <Suspense fallback={null}>
          {addItemOpen && <AddItemModal />}
          {addPageOpen && <AddPageModal />}
          {addStructureOpen && <AddStructureModal />}
          {settingsOpen && <SettingsModal />}
        </Suspense>
      </ErrorBoundary>

      {/* The guided tour. Renders nothing until someone asks for it. */}
      <ErrorBoundary label="the tutorial">
        <TutorialOverlay />
      </ErrorBoundary>

      {/* Headless updater bridge; visible status and actions live in the bell. */}
      <UpdateNotification />
    </div>
  )
}
