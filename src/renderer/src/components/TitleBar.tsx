import { useEffect, useState } from 'react'
import {
  Activity,
  Bell,
  ChevronRight,
  CircleCheck,
  Copy,
  Download,
  LoaderCircle,
  Minus,
  Redo2,
  RefreshCw,
  Search,
  Square,
  Trash2,
  TriangleAlert,
  Undo2,
  X
} from 'lucide-react'
import {
  useStore,
  useSelectedNode,
  type AppNotification
} from '../store/useStore'
import { isComponentLike } from '../lib/tree'
import { isRenamable } from './nodeVisual'
import EstimateMark from './tutorial/EstimateMark'
import HelpMenu from './tutorial/HelpMenu'
import { isTauriRuntime } from '../lib/platformApi'

type MenuName = 'file' | 'component' | 'help' | null

export default function TitleBar(): JSX.Element {
  const [menu, setMenu] = useState<MenuName>(null)
  const [recentOpen, setRecentOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)

  const view = useStore((s) => s.view)
  const project = useStore((s) => s.project)
  const dirty = useStore((s) => s.dirty)
  const recent = useStore((s) => s.recent)
  const globalSearch = useStore((s) => s.globalSearch)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const notifications = useStore((s) => s.appNotifications)
  const markNotificationsRead = useStore((s) => s.markAllAppNotificationsRead)
  const selected = useSelectedNode()

  const s = useStore.getState()

  useEffect(() => {
    void window.api.window.isMaximized().then(setMaximized)
    return window.api.window.onMaximizedChanged(setMaximized)
  }, [])

  const unreadCount = notifications.filter((notification) => !notification.read).length
  const hasActiveNotification = notifications.some((notification) =>
    ['running', 'cancelling', 'update-downloading'].includes(notification.status)
  )

  useEffect(() => {
    if (notificationsOpen && unreadCount > 0) markNotificationsRead()
  }, [markNotificationsRead, notificationsOpen, unreadCount])

  const hasProject = !!project
  const close = (): void => {
    setMenu(null)
    setRecentOpen(false)
    setNotificationsOpen(false)
  }

  const fileItems = (): JSX.Element => (
    <div className="menu-dropdown" onClick={(e) => e.stopPropagation()}>
      <MenuItem label="Home" onClick={() => act(() => useStore.getState().goHome())} />
      <MenuItem label="New Project" shortcut="Ctrl+N" onClick={() => act(() => useStore.getState().startNewProject())} />
      <MenuItem label="Open Project…" shortcut="Ctrl+O" onClick={() => act(() => void useStore.getState().openProjectFromDisk())} />
      <div
        className="menu-dd-item"
        onMouseEnter={() => setRecentOpen(true)}
        onMouseLeave={() => setRecentOpen(false)}
        style={{ position: 'relative' }}
      >
        <span>Open Recent</span>
        <ChevronRight size={14} />
        {recentOpen && (
          <div className="menu-dropdown" style={{ top: -4, left: '100%', maxHeight: 320, overflow: 'auto' }}>
            {recent.length === 0 && <div className="menu-dd-item" style={{ pointerEvents: 'none' }}>No recent projects</div>}
            {recent.map((r) => (
              <button key={r.path} className="menu-dd-item" title={r.path} onClick={() => act(() => void useStore.getState().openRecent(r.path))}>
                <span className="sc-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                  {r.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="menu-sep" />
      <MenuItem label="Save" shortcut="Ctrl+S" disabled={!hasProject} onClick={() => act(() => void useStore.getState().saveProject())} />
      <MenuItem label="Save As…" disabled={!hasProject} onClick={() => act(() => void useStore.getState().saveProjectAs())} />
      <MenuItem label="Close Project" disabled={!hasProject} onClick={() => act(() => useStore.getState().closeProject())} />
    </div>
  )

  const componentMenu = (): JSX.Element => {
    const canSub = !!selected && isComponentLike(selected)
    const canItem = hasProject
    const pageParent =
      selected &&
      (selected.kind === 'title' ||
        selected.kind === 'component' ||
        selected.kind === 'subcomponent')
        ? selected.id
        : project?.root.id
    const canRename = !!selected && isRenamable(selected)
    const canDelete = !!selected && selected.kind !== 'title'
    return (
      <div className="menu-dropdown" onClick={(e) => e.stopPropagation()}>
        <MenuItem label="Add Component" disabled={!hasProject} onClick={() => act(() => useStore.getState().addComponent())} />
        <MenuItem label="Add Sub-component" disabled={!canSub} onClick={() => act(() => selected && useStore.getState().addSubcomponent(selected.id))} />
        <MenuItem label="Add Page..." disabled={!hasProject} onClick={() => act(() => pageParent && useStore.getState().openAddPage(pageParent))} />
        <MenuItem label="Add Item…" disabled={!canItem} onClick={() => act(() => useStore.getState().openAddItem(selected?.id ?? project!.root.id))} />
        <div className="menu-sep" />
        <MenuItem label="Rename" disabled={!canRename} onClick={() => act(() => selected && useStore.getState().beginRename(selected.id))} />
        <MenuItem label="Delete" disabled={!canDelete} onClick={() => act(() => selected && useStore.getState().deleteNode(selected.id))} />
        <MenuItem label="Duplicate" disabled soon onClick={() => undefined} />
        <MenuItem label="Move" disabled soon onClick={() => undefined} />
      </div>
    )
  }

  function act(fn: () => void): void {
    fn()
    close()
  }

  return (
    <div className="titlebar" onClick={close}>
      {(menu || notificationsOpen) && <div className="menu-backdrop" onClick={close} />}
      <div className="titlebar-left" onClick={(e) => e.stopPropagation()}>
        <div className="tb-brand">
          <EstimateMark size={16} />
          E-Estimate
        </div>

        <div className="tb-menu">
          <button
            data-tour="menu-file"
            className={`tb-menu-btn ${menu === 'file' ? 'open' : ''}`}
            onClick={() => {
              setNotificationsOpen(false)
              setMenu(menu === 'file' ? null : 'file')
            }}
          >
            File
          </button>
          {menu === 'file' && fileItems()}
        </div>

        <div className="tb-menu">
          <button
            className={`tb-menu-btn ${menu === 'component' ? 'open' : ''}`}
            onClick={() => {
              setNotificationsOpen(false)
              setMenu(menu === 'component' ? null : 'component')
            }}
          >
            Component
          </button>
          {menu === 'component' && componentMenu()}
        </div>

        {/* Help is where the tutorial lives once the first run is behind you. */}
        <div className="tb-menu">
          <button
            data-tour="menu-help"
            className={`tb-menu-btn ${menu === 'help' ? 'open' : ''}`}
            onClick={() => {
              setNotificationsOpen(false)
              setMenu(menu === 'help' ? null : 'help')
            }}
          >
            Help
          </button>
          {menu === 'help' && <HelpMenu onPick={close} />}
        </div>

        <button className="tb-iconbtn" title="Undo" disabled={!canUndo} onClick={() => s.undo()}>
          <Undo2 size={16} />
        </button>
        <button className="tb-iconbtn" title="Redo" disabled={!canRedo} onClick={() => s.redo()}>
          <Redo2 size={16} />
        </button>
      </div>

      <div className="titlebar-center" onClick={(e) => e.stopPropagation()}>
        <div className="tb-search">
          <Search size={14} />
          <input
            placeholder={hasProject ? 'Search project, pages, items…' : 'Search…'}
            value={globalSearch}
            onChange={(e) => useStore.getState().setGlobalSearch(e.target.value)}
            onFocus={() => {
              if (hasProject) useStore.getState().setActivity('search')
            }}
          />
        </div>
      </div>

      <div className="titlebar-right" onClick={(e) => e.stopPropagation()}>
        {hasProject && (
          <span style={{ color: 'var(--text-faint)', fontSize: 11, marginRight: 10 }}>
            {project!.meta.name || 'Untitled'}
            {dirty ? ' •' : ''}
            {view === 'newproject' ? ' (new)' : ''}
          </span>
        )}
        <div className="tb-notification-wrap">
          <button
            type="button"
            className={`tb-notification-button ${notificationsOpen ? 'open' : ''} ${
              hasActiveNotification ? 'has-active' : ''
            }`}
            title="Notifications"
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : 'Notifications'
            }
            aria-expanded={notificationsOpen}
            onClick={() => {
              setMenu(null)
              setNotificationsOpen((open) => !open)
            }}
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="tb-notification-badge">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {notificationsOpen && <NotificationPanel />}
        </div>
          {isTauriRuntime() && (
        <div className="window-controls">
          <button className="wc-btn" title="Minimize" onClick={() => window.api.window.minimize()}>
            <Minus size={15} />
          </button>
          <button className="wc-btn" title={maximized ? 'Restore' : 'Maximize'} onClick={() => window.api.window.toggleMaximize()}>
            {maximized ? <Copy size={13} /> : <Square size={13} />}
          </button>
          <button className="wc-btn close" title="Close" onClick={() => window.api.window.close()}>
            <X size={16} />
          </button>
        </div>
          )}
      </div>
    </div>
  )
}

function NotificationPanel(): JSX.Element {
  const notifications = useStore((state) => state.appNotifications)
  const jobs = useStore((state) => state.bundSimulationJobs)
  const cancelJob = useStore((state) => state.cancelBundSimulationJob)
  const dismiss = useStore((state) => state.dismissAppNotification)
  const clearFinished = useStore((state) => state.clearFinishedAppNotifications)
  const [now, setNow] = useState(Date.now())

  const hasTimedActivity = notifications.some((notification) =>
    ['running', 'cancelling'].includes(notification.status)
  )
  const canClear = notifications.some(
    (notification) =>
      !['running', 'cancelling', 'update-downloading'].includes(notification.status)
  )

  useEffect(() => {
    if (!hasTimedActivity) return
    const handle = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(handle)
  }, [hasTimedActivity])

  const handleCancel = (notification: AppNotification): void => {
    if (!notification.nodeId) return
    if (
      window.confirm(
        `Cancel ${notification.title.replace(/^Running · /, '')}? ` +
          'Its unfinished numerical result will not be available.'
      )
    ) {
      void cancelJob(notification.nodeId)
    }
  }

  return (
    <aside
      className="tb-notification-panel"
      aria-label="Notification centre"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="tb-notification-header">
        <div>
          <strong>Notifications</strong>
          <small>Simulations and application updates</small>
        </div>
        {canClear && (
          <button type="button" className="tb-notification-text-button" onClick={clearFinished}>
            Clear finished
          </button>
        )}
      </header>

      <div className="tb-notification-list" role="list" aria-live="polite">
        {notifications.length === 0 && (
          <div className="tb-notification-empty">
            <Bell size={22} />
            <strong>No notifications</strong>
            <span>Running simulations and available updates will appear here.</span>
          </div>
        )}

        {notifications.map((notification) => {
          const active = ['running', 'cancelling', 'update-downloading'].includes(
            notification.status
          )
          const job = notification.nodeId ? jobs[notification.nodeId] : undefined
          const startedAt = job?.startedAt ?? notification.createdAt
          const elapsed =
            notification.kind === 'simulation' && active
              ? formatElapsed(now - new Date(startedAt).getTime())
              : null

          return (
            <article
              key={notification.id}
              className={`tb-notification-row is-${notification.status}`}
              role="listitem"
            >
              <NotificationIcon notification={notification} />
              <div className="tb-notification-copy">
                <div className="tb-notification-row-heading">
                  <strong>{notification.title}</strong>
                  {!active && (
                    <button
                      type="button"
                      className="tb-notification-dismiss"
                      title="Dismiss notification"
                      onClick={() => dismiss(notification.id)}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <span>{notification.message}</span>
                <small>
                  {notification.kind === 'simulation' && notification.chainage !== undefined
                    ? `Ch. ${notification.chainage} m${elapsed ? ` · elapsed ${elapsed}` : ''}`
                    : notification.releaseDate
                      ? new Date(notification.releaseDate).toLocaleDateString()
                      : formatNotificationTime(notification.updatedAt)}
                </small>

                {notification.status === 'update-downloading' && (
                  <div className="tb-notification-progress" aria-label={`${notification.progress ?? 0}% downloaded`}>
                    <span style={{ width: `${notification.progress ?? 0}%` }} />
                  </div>
                )}

                <div className="tb-notification-actions">
                  {notification.status === 'running' && (
                    <button type="button" className="btn ghost" onClick={() => handleCancel(notification)}>
                      Cancel simulation
                    </button>
                  )}
                  {notification.status === 'cancelling' && (
                    <span className="tb-notification-muted">Waiting for the solver to stop…</span>
                  )}
                  {notification.status === 'update-available' && (
                    <span className="tb-notification-muted">Automatic download is starting…</span>
                  )}
                  {notification.status === 'update-downloaded' && (
                    <button type="button" className="btn primary" onClick={() => window.api.update.install()}>
                      Restart &amp; install
                    </button>
                  )}
                  {notification.status === 'update-error' && (
                    <button type="button" className="btn ghost" onClick={() => void window.api.update.check()}>
                      <RefreshCw size={14} /> Check again
                    </button>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <footer className="tb-notification-footer">
        <button type="button" onClick={() => void window.api.update.check()}>
          <RefreshCw size={13} /> Check for application updates
        </button>
        {canClear && (
          <button type="button" title="Clear finished notifications" onClick={clearFinished}>
            <Trash2 size={13} />
          </button>
        )}
      </footer>
    </aside>
  )
}

function NotificationIcon({ notification }: { notification: AppNotification }): JSX.Element {
  if (['running', 'cancelling', 'update-downloading'].includes(notification.status)) {
    return (
      <span className="tb-notification-status is-progress" aria-hidden="true">
        <LoaderCircle size={17} />
      </span>
    )
  }
  if (['complete', 'update-downloaded'].includes(notification.status)) {
    return (
      <span className="tb-notification-status is-success" aria-hidden="true">
        <CircleCheck size={17} />
      </span>
    )
  }
  if (['error', 'cancelled', 'update-error'].includes(notification.status)) {
    return (
      <span className="tb-notification-status is-error" aria-hidden="true">
        <TriangleAlert size={17} />
      </span>
    )
  }
  if (notification.kind === 'update') {
    return (
      <span className="tb-notification-status is-update" aria-hidden="true">
        <Download size={17} />
      </span>
    )
  }
  return (
    <span className="tb-notification-status" aria-hidden="true">
      <Activity size={17} />
    </span>
  )
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function formatNotificationTime(value: string): string {
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return ''
  return time.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function MenuItem({
  label,
  shortcut,
  disabled,
  soon,
  tour,
  onClick
}: {
  label: string
  shortcut?: string
  disabled?: boolean
  soon?: boolean
  /** Optional tutorial anchor — menu labels are not unique across menus. */
  tour?: string
  onClick: () => void
}): JSX.Element {
  return (
    <button className="menu-dd-item" data-tour={tour} disabled={disabled} onClick={onClick}>
      <span>
        {label}
        {soon && <span className="badge-soon">soon</span>}
      </span>
      {shortcut && <span className="shortcut">{shortcut}</span>}
    </button>
  )
}
