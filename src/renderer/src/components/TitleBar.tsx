import { useEffect, useState } from 'react'
import {
  ChevronRight,
  Copy,
  Minus,
  Redo2,
  Search,
  Square,
  Undo2,
  X
} from 'lucide-react'
import { useStore, useSelectedNode } from '../store/useStore'
import { isComponentLike } from '../lib/tree'
import { isRenamable } from './nodeVisual'

type MenuName = 'file' | 'component' | null

export default function TitleBar(): JSX.Element {
  const [menu, setMenu] = useState<MenuName>(null)
  const [recentOpen, setRecentOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)

  const view = useStore((s) => s.view)
  const project = useStore((s) => s.project)
  const dirty = useStore((s) => s.dirty)
  const recent = useStore((s) => s.recent)
  const globalSearch = useStore((s) => s.globalSearch)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const selected = useSelectedNode()

  const s = useStore.getState()

  useEffect(() => {
    void window.api.window.isMaximized().then(setMaximized)
    return window.api.window.onMaximizedChanged(setMaximized)
  }, [])

  const hasProject = !!project
  const close = (): void => {
    setMenu(null)
    setRecentOpen(false)
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
      <MenuItem label="Export" disabled soon onClick={() => undefined} />
      <div className="menu-sep" />
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
      {menu && <div className="menu-backdrop" onClick={close} />}
      <div className="titlebar-left" onClick={(e) => e.stopPropagation()}>
        <div className="tb-brand">
          <span className="logo-cube" />
          E-Estimate
        </div>

        <div className="tb-menu">
          <button className={`tb-menu-btn ${menu === 'file' ? 'open' : ''}`} onClick={() => setMenu(menu === 'file' ? null : 'file')}>
            File
          </button>
          {menu === 'file' && fileItems()}
        </div>

        <div className="tb-menu">
          <button className={`tb-menu-btn ${menu === 'component' ? 'open' : ''}`} onClick={() => setMenu(menu === 'component' ? null : 'component')}>
            Component
          </button>
          {menu === 'component' && componentMenu()}
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
      </div>
    </div>
  )
}

function MenuItem({
  label,
  shortcut,
  disabled,
  soon,
  onClick
}: {
  label: string
  shortcut?: string
  disabled?: boolean
  soon?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button className="menu-dd-item" disabled={disabled} onClick={onClick}>
      <span>
        {label}
        {soon && <span className="badge-soon">soon</span>}
      </span>
      {shortcut && <span className="shortcut">{shortcut}</span>}
    </button>
  )
}
