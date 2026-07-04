import { useState } from 'react'
import Modal from './Modal'
import { useStore } from '../../store/useStore'
import { findNode } from '../../lib/tree'
import { SETTINGS_DEFAULTS as DEFAULTS } from '../../lib/nodeSettings'
import { isRenamable, kindLabel } from '../nodeVisual'
import type { ItemEditorType, NodeSettings } from '../../types/project'

export default function SettingsModal(): JSX.Element {
  const nodeId = useStore((s) => s.settings.nodeId)
  const project = useStore((s) => s.project)
  const close = useStore((s) => s.closeSettings)
  const renameNode = useStore((s) => s.renameNode)
  const updateNodeSettings = useStore((s) => s.updateNodeSettings)
  const setItemEditorType = useStore((s) => s.setItemEditorType)

  const node = project && nodeId ? findNode(project.root, nodeId) : null

  const [name, setName] = useState(node?.itemCode || node?.name || '')
  const [itemEditorType, setEditorType] = useState<ItemEditorType>(
    node?.itemEditorType ?? 'spreadsheet'
  )
  const [cfg, setCfg] = useState<Required<NodeSettings>>({
    ...DEFAULTS,
    ...(node?.settings ?? {}),
    margins: { ...DEFAULTS.margins, ...(node?.settings?.margins ?? {}) }
  })

  if (!node) {
    return (
      <Modal title="Settings" onClose={close}>
        <div className="list-empty">No node selected.</div>
      </Modal>
    )
  }

  const renamable = isRenamable(node)
  const isItem = node.kind === 'item'
  const isTitle = node.kind === 'title'

  const save = (): void => {
    if (renamable && name.trim() && name.trim() !== node.name) renameNode(node.id, name.trim())
    if (isItem) {
      if (itemEditorType !== (node.itemEditorType ?? 'spreadsheet')) {
        setItemEditorType(node.id, itemEditorType)
      }
    } else {
      updateNodeSettings(node.id, cfg)
    }
    close()
  }

  const footer = (
    <>
      <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>{kindLabel(node)} settings</span>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn ghost" onClick={close}>
          Cancel
        </button>
        <button className="btn" onClick={save}>
          Save
        </button>
      </div>
    </>
  )

  return (
    <Modal title={`${kindLabel(node)} Settings`} onClose={close} footer={footer}>
      <div className="field">
        <label className="field-label">Name</label>
        <input
          className="text-input"
          value={name}
          disabled={!renamable}
          onChange={(e) => setName(e.target.value)}
        />
        {!renamable && (
          <div className="scm-disabled-hint">
            {isItem
              ? 'SOR/SSR item names are locked. Only “Others” items can be renamed.'
              : 'This name cannot be changed.'}
          </div>
        )}
      </div>

      {isItem ? (
        <>
          {node.itemDescription && (
            <div className="field">
              <label className="field-label">Description</label>
              <div className="settings-readonly">{node.itemDescription}</div>
            </div>
          )}
          <div className="field">
            <label className="field-label">Editor Type</label>
            <select
              className="select-input"
              value={itemEditorType}
              onChange={(event) => setEditorType(event.target.value as ItemEditorType)}
            >
              <option value="spreadsheet">Spreadsheet (Univer)</option>
              <option value="document">Document (Native)</option>
            </select>
          </div>
          <div className="settings-note">
            New items use Spreadsheet by default. Univer workbook content is stored in the project
            file.
          </div>
        </>
      ) : (
        <>
          {!isTitle && (
            <div className="settings-note">
              Page settings inherit from the Title by default. Changing them here overrides the
              inherited values for this {kindLabel(node).toLowerCase()}.
            </div>
          )}

          <div className="field-row">
            <div className="field">
              <label className="field-label">Page Size</label>
              <select
                className="select-input"
                value={cfg.pageSize}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    pageSize: e.target.value as Required<NodeSettings>['pageSize']
                  }))
                }
              >
                {(['A4', 'A3', 'A2', 'Letter', 'Legal'] as const).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Default Orientation</label>
              <select
                className="select-input"
                value={cfg.orientation}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    orientation: e.target.value as Required<NodeSettings>['orientation']
                  }))
                }
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label className="field-label">Margins (mm)</label>
            <div className="field-row">
              {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <div className="field" key={side}>
                  <input
                    className="text-input"
                    type="number"
                    aria-label={`${side} margin`}
                    placeholder={side}
                    value={cfg.margins[side]}
                    onChange={(e) =>
                      setCfg((c) => ({
                        ...c,
                        margins: { ...c.margins, [side]: Number(e.target.value) }
                      }))
                    }
                  />
                  <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2 }}>
                    {side}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="field-label">Default Print Area</label>
              <select
                className="select-input"
                value={cfg.printArea}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    printArea: e.target.value as Required<NodeSettings>['printArea']
                  }))
                }
              >
                <option value="constrain-columns">Constrain by columns (rows grow)</option>
                <option value="free">Free</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">Borders</label>
              <button
                className={`flag-chip ${cfg.borders ? 'selected' : ''}`}
                style={{ width: '100%' }}
                onClick={() => setCfg((c) => ({ ...c, borders: !c.borders }))}
              >
                <span className="flag-check">{cfg.borders ? '✓' : ''}</span>
                {cfg.borders ? 'Borders on' : 'Borders off'}
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}
