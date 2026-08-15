import { useEffect, useMemo, useRef, useState } from 'react'
import { Component, Layers, MapPin, Ruler } from 'lucide-react'
import Modal from './Modal'
import { useStore } from '../../store/useStore'
import { findNode, uniqueChildName } from '../../lib/tree'
import type { ComponentTemplateId, ProjectLocation } from '../../types/project'
import LocationMap from '../newproject/LocationMap'
import { COMPONENT_TEMPLATES } from '../../templates/registry'

export default function AddStructureModal(): JSX.Element | null {
  const project = useStore((state) => state.project)
  const state = useStore((store) => store.addStructure)
  const close = useStore((store) => store.closeAddStructure)
  const createStructureNode = useStore((store) => store.createStructureNode)
  const [name, setName] = useState(state.kind === 'component' ? 'New Component' : 'New Sub-component')
  const [location, setLocation] = useState<ProjectLocation | null>(project?.meta.location ?? null)
  const [recenterToken, setRecenterToken] = useState(0)
  const [templateId, setTemplateId] = useState<ComponentTemplateId | null>(null)
  // Once a name has been typed it is the user's, and picking a template must
  // not take it back — even if what was typed happens to read like a template
  // name. Comparing the text could not tell those two cases apart.
  const [nameTouched, setNameTouched] = useState(false)
  const parentNode = useMemo(
    () => (project && state.parentId ? findNode(project.root, state.parentId) : project?.root ?? null),
    [project, state.parentId]
  )
  const resolvedName = useMemo(
    () => uniqueChildName(parentNode, name),
    [name, parentNode]
  )
  // `autoFocus` lands before the Leaflet map next to it finishes mounting, and
  // the map can take the focus back — leaving the field looking editable while
  // keystrokes go nowhere. Claiming it again after that settles is reliable.
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const handle = window.setTimeout(() => nameRef.current?.focus(), 0)
    return () => window.clearTimeout(handle)
  }, [])

  const pickTemplate = (id: ComponentTemplateId | null): void => {
    setTemplateId(id)
    if (nameTouched) return
    const fallback = state.kind === 'component' ? 'New Component' : 'New Sub-component'
    setName(id ? COMPONENT_TEMPLATES.find((t) => t.id === id)?.name ?? fallback : fallback)
  }

  const parentName = useMemo(() => {
    if (!project) return ''
    return parentNode?.name || project.root.name
  }, [parentNode, project])

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
    createStructureNode(name, location ?? projectLocation ?? null, templateId ?? undefined)
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
              ref={nameRef}
              className="text-input"
              value={name}
              placeholder={
                state.kind === 'component'
                  ? 'Enter a component name'
                  : 'Enter a sub-component name'
              }
              autoFocus
              onChange={(event) => {
                setNameTouched(true)
                setName(event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') confirm()
              }}
            />
            {name.trim() && resolvedName !== name.trim() && (
              <small style={{ color: 'var(--text-dim)', marginTop: 5 }}>
                A sibling already has that name. This one will be created as{' '}
                <strong style={{ color: 'var(--text)' }}>{resolvedName}</strong>.
              </small>
            )}
          </div>
          <div className="field">
            <label className="field-label">Type</label>
            <div className="template-choice-list">
              <button
                type="button"
                className={`template-choice ${templateId === null ? 'active' : ''}`}
                onClick={() => pickTemplate(null)}
              >
                <Component size={16} />
                <span>
                  <strong>Custom</strong>
                  <small>Blank {state.kind === 'component' ? 'component' : 'sub-component'}: add items and pages yourself.</small>
                </span>
              </button>
              {COMPONENT_TEMPLATES.map((template) => (
                <button
                  type="button"
                  key={template.id}
                  className={`template-choice ${templateId === template.id ? 'active' : ''}`}
                  onClick={() => pickTemplate(template.id)}
                >
                  <Ruler size={16} />
                  <span>
                    <strong>{template.name}</strong>
                    <small>{template.description}</small>
                  </span>
                </button>
              ))}
            </div>
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
          onReady={() => {
            window.setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 0)
          }}
        />
      </div>
    </Modal>
  )
}
