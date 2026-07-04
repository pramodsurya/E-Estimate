import { useMemo, useState } from 'react'
import { Component, Layers, MapPin } from 'lucide-react'
import Modal from './Modal'
import { useStore } from '../../store/useStore'
import { findNode } from '../../lib/tree'
import type { ProjectLocation } from '../../types/project'
import LocationMap from '../newproject/LocationMap'

export default function AddStructureModal(): JSX.Element | null {
  const project = useStore((state) => state.project)
  const state = useStore((store) => store.addStructure)
  const close = useStore((store) => store.closeAddStructure)
  const createStructureNode = useStore((store) => store.createStructureNode)
  const [name, setName] = useState(state.kind === 'component' ? 'New Component' : 'New Sub-component')
  const [location, setLocation] = useState<ProjectLocation | null>(project?.meta.location ?? null)
  const [recenterToken, setRecenterToken] = useState(0)

  const parentName = useMemo(() => {
    if (!project) return ''
    return (state.parentId && findNode(project.root, state.parentId)?.name) || project.root.name
  }, [project, state.parentId])

  if (!project) return null

  const title = state.kind === 'component' ? 'Add Component' : 'Add Sub-component'
  const Icon = state.kind === 'component' ? Component : Layers
  const projectLocation = project.meta.location

  const useProjectLocation = (): void => {
    if (!projectLocation) return
    setLocation(projectLocation)
    setRecenterToken((value) => value + 1)
  }

  const confirm = (): void => {
    if (!name.trim()) return
    createStructureNode(name, location ?? projectLocation ?? null)
  }

  const footer = (
    <>
      <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
        Adding to <b style={{ color: 'var(--text)' }}>{parentName}</b>
      </span>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn ghost" onClick={close}>
          Cancel
        </button>
        <button className="btn" disabled={!name.trim()} onClick={confirm}>
          <Icon size={15} /> Create
        </button>
      </div>
    </>
  )

  return (
    <Modal title={title} size="lg" onClose={close} footer={footer}>
      <div className="structure-modal-grid">
        <div className="structure-modal-fields">
          <div className="field">
            <label className="field-label" htmlFor="structure-name">
              Name
            </label>
            <input
              id="structure-name"
              className="text-input"
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') confirm()
              }}
            />
          </div>
          <div className="settings-note">
            This point becomes the working location for this component/sub-component. If no
            separate point is selected, the project working location is used.
          </div>
          <div className="map-tools">
            <button className="btn ghost" onClick={useProjectLocation} disabled={!projectLocation}>
              <MapPin size={14} /> Use Project Working Location
            </button>
          </div>
          <div className="latlng-display">
            {location
              ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}${
                  location.label ? ` · ${location.label}` : ''
                }`
              : 'Click the map to set a working point.'}
          </div>
        </div>
        <LocationMap
          value={location}
          onPick={(lat, lng) => setLocation({ lat, lng, label: name.trim() || title })}
          recenterToken={recenterToken}
        />
      </div>
    </Modal>
  )
}
