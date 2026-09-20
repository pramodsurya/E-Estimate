import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Component,
  Eraser,
  Layers,
  LoaderCircle,
  MapPin,
  Route,
  Ruler
} from 'lucide-react'
import Modal from './Modal'
import { useStore } from '../../store/useStore'
import { findNode, uniqueChildName } from '../../lib/tree'
import { resolveAreaAllowance } from '../../lib/masterData'
import { workingLineCentroid } from '../../lib/componentAllowance'
import { migrateBundData } from '../../lib/bund'
import { migrateCanalData } from '../../lib/canal'
import { cumulativeLengthsM, formatLengthM, migrateGuideWallData, polylineLengthM } from '../../lib/guideWall'
import { resolveTemplateGeometryEdit } from '../../lib/geometryImport'
import { normalizePlaceName } from '../../lib/placeNormalization'
import type {
  ComponentTemplateId,
  ProjectAreaAllowance,
  ProjectLocation
} from '../../types/project'
import { COMPONENT_TEMPLATES } from '../../templates/registry'
import WorkingPointMap, { type WorkingGeometryMode } from '../newproject/WorkingPointMap'

function copyVertices(vertices: { lat: number; lng: number }[]): { lat: number; lng: number }[] {
  return vertices.map((vertex) => ({ lat: vertex.lat, lng: vertex.lng }))
}

function decideTemplateEdit(
  line: { lat: number; lng: number }[] | null,
  typedLengthM: number | null,
  current: { alignment: { lat: number; lng: number }[]; source: 'map' | 'manual'; lengthM: number }
): { alignment: { lat: number; lng: number }[]; source: 'map' | 'manual'; lengthM: number } {
  return resolveTemplateGeometryEdit({
    line,
    typedLengthM,
    currentLengthM: current.lengthM,
    currentAlignment: copyVertices(current.alignment),
    currentSource: current.source
  })
}
import GeometryImportPanel, {
  importRowSpecs,
  type GeometryImportPanelHandle,
  type ImportProposalRow
} from '../newproject/GeometryImportPanel'

/**
 * Component creation is a two-page wizard: 1) name and type, 2) geometry for
 * every component type (point/line draw, manual length, upload with trim,
 * delete and extend). Template geometry presets the template setup, whose
 * length step is fed from here; multi-line uploads create same-type components
 * (branches become sub-components). The component page's Edit button reopens
 * this same wizard in edit mode (editNodeId): name and type locked, the locate
 * page prefilled, Save writing back to the one component.
 */
export default function AddStructureModal(): JSX.Element | null {
  const project = useStore((state) => state.project)
  const state = useStore((store) => store.addStructure)
  const close = useStore((store) => store.closeAddStructure)
  const createStructureNode = useStore((store) => store.createStructureNode)
  const createComponentsFromImport = useStore((store) => store.createComponentsFromImport)
  const createTemplatedComponentsFromImport = useStore((store) => store.createTemplatedComponentsFromImport)
  const setBund = useStore((store) => store.setBund)
  const setCanal = useStore((store) => store.setCanal)
  const setGuideWall = useStore((store) => store.setGuideWall)
  const setNodeWorkingLocation = useStore((store) => store.setNodeWorkingLocation)
  // Edit mode reuses this same wizard for one existing component: name and type
  // are locked, the locate page opens prefilled, and Save writes back.
  const editNodeId = state.editNodeId ?? null
  const editNode = useMemo(
    () => (project && editNodeId ? findNode(project.root, editNodeId) : null),
    [project, editNodeId]
  )
  const isEdit = editNodeId !== null
  const editLengthSeed = editNode
    ? Math.round(editNode.bund?.lengthM ?? editNode.canal?.lengthM ?? editNode.guideWall?.lengthM ?? 0)
    : 0
  const [name, setName] = useState(editNode?.name ?? (state.kind === 'component' ? 'New Component' : 'New Sub-component'))
  const [templateId, setTemplateId] = useState<ComponentTemplateId | null>(editNode?.templateId ?? null)
  // Page 1 asks name + type only; page 2 locates every component type.
  const [page, setPage] = useState<1 | 2>(isEdit ? 2 : 1)
  // Once a name has been typed it is the user's, and picking a template must
  // not take it back — even if what was typed happens to read like a template
  // name. Comparing the text could not tell those two cases apart.
  const [nameTouched, setNameTouched] = useState(isEdit)
  const [locateMode, setLocateMode] = useState<WorkingGeometryMode>(
    editNode && (editNode.templateId || (editNode.workingLine?.length ?? 0) >= 2) ? 'line' : 'point'
  )
  const [point, setPoint] = useState<ProjectLocation | null>(editNode?.location ?? null)
  const [line, setLine] = useState<{ lat: number; lng: number }[]>(() =>
    editNode?.templateId === 'bund' && editNode.bund
      ? copyVertices(migrateBundData(editNode.bund).alignment)
      : editNode?.templateId === 'canal' && editNode.canal
        ? copyVertices(migrateCanalData(editNode.canal).alignment)
        : editNode?.templateId === 'guide-wall' && editNode.guideWall
          ? copyVertices(migrateGuideWallData(editNode.guideWall).alignment)
          : copyVertices(editNode?.workingLine ?? [])
  )
  // Typed length for a template with no map (step 2 of the template is fed).
  // Seeded only when no line is stored: a prefilled value would override every
  // redraw, so with a line the input starts empty and the measured length shows.
  const [manualLengthM, setManualLengthM] = useState(
    line.length >= 2 ? '' : editLengthSeed > 0 ? String(editLengthSeed) : ''
  )
  const [fitToken, setFitToken] = useState(0)
  const [importRows, setImportRows] = useState<ImportProposalRow[] | null>(null)
  const [extendKey, setExtendKey] = useState<string | null>(null)
  const importActiveRef = useRef(false)
  const panelRef = useRef<GeometryImportPanelHandle | null>(null)
  const [allowance, setAllowance] = useState<ProjectAreaAllowance | null>(editNode?.areaAllowance ?? null)
  const [resolvingAllowance, setResolvingAllowance] = useState(false)
  const [allowanceError, setAllowanceError] = useState<string | null>(null)
  const parentNode = useMemo(
    () => (project && state.parentId ? findNode(project.root, state.parentId) : project?.root ?? null),
    [project, state.parentId]
  )
  const resolvedName = useMemo(
    () => uniqueChildName(parentNode, name),
    [name, parentNode]
  )
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const handle = window.setTimeout(() => nameRef.current?.focus(), 0)
    return () => window.clearTimeout(handle)
  }, [])

  const sorYear = project?.meta.sorYear ?? ''
  const drawnCentroid = line.length >= 2 ? workingLineCentroid(line) : null
  const lineCum = useMemo(() => cumulativeLengthsM(line), [line])
  // Templates are line-only: their allowance (when drawn) reads at the middle.
  const lookup = templateId ? drawnCentroid : locateMode === 'point' ? point : drawnCentroid

  useEffect(() => {
    if (!lookup || !sorYear) {
      setAllowance(null)
      setAllowanceError(null)
      return
    }
    let alive = true
    setResolvingAllowance(true)
    setAllowanceError(null)
    void resolveAreaAllowance({ lat: lookup.lat, lng: lookup.lng }, sorYear)
      .then((resolved) => {
        if (alive) setAllowance(resolved)
      })
      .catch((reason: unknown) => {
        if (!alive) return
        setAllowance(null)
        setAllowanceError(
          reason instanceof Error ? reason.message : 'Could not determine area allowance.'
        )
      })
      .finally(() => {
        if (alive) setResolvingAllowance(false)
      })
    return () => {
      alive = false
    }
  }, [lookup?.lat, lookup?.lng, sorYear])

  if (!project || (isEdit && !editNode)) return null

  const isComponent = state.kind === 'component'
  const isCustomType = templateId === null
  const Icon = isComponent ? Component : Layers
  const templateLabel = templateId
    ? COMPONENT_TEMPLATES.find((t) => t.id === templateId)?.name ?? 'Component'
    : null
  const title = isEdit
    ? `Edit ${templateLabel ?? 'Custom'} location`
    : !isComponent ? 'Add Sub-component' : page === 2 ? `Locate ${templateLabel ?? 'Custom'}` : 'Add Component'

  const pickTemplate = (id: ComponentTemplateId | null): void => {
    setTemplateId(id)
    if (nameTouched) return
    const fallback = isComponent ? 'New Component' : 'New Sub-component'
    setName(id ? COMPONENT_TEMPLATES.find((t) => t.id === id)?.name ?? fallback : fallback)
  }

  const switchLocateMode = (mode: WorkingGeometryMode): void => {
    setLocateMode(mode)
    setExtendKey(null)
    setFitToken((value) => value + 1)
  }

  const clearGeometry = (): void => {
    setPoint(null)
    setLine([])
    setFitToken((value) => value + 1)
  }

  const removeVertex = (index: number): void => {
    setLine((current) => current.filter((_, vertex) => vertex !== index))
  }

  const parentName = parentNode?.name || project.root.name

  const handleImportRows = (rows: ImportProposalRow[] | null): void => {
    setImportRows(rows)
    const active = rows !== null
    if (active && !importActiveRef.current) setFitToken((value) => value + 1)
    importActiveRef.current = active
    if (!rows) {
      setExtendKey(null)
    } else {
      setPoint(null)
      setLine([])
    }
  }

  const handleToggleExtend = (key: string | null): void => {
    setExtendKey(key)
    if (key) setLocateMode('line')
  }

  const handleMapPickPoint = (lat: number, lng: number): void => {
    if (extendKey) return
    setPoint({ lat, lng, label: name.trim() || title })
  }

  const handleMapAddVertex = (lat: number, lng: number): void => {
    if (extendKey && panelRef.current) {
      panelRef.current.appendVertex(extendKey, { lat, lng })
      return
    }
    setLine((current) => [...current, { lat, lng }])
  }

  /** Create with no working geometry (templates, sub-components). */
  const finish = (
    chosenTemplate: ComponentTemplateId | undefined,
    location: ProjectLocation | null,
    resolved: ProjectAreaAllowance | null,
    workingLine: { lat: number; lng: number }[] | null
  ): void => {
    if (!name.trim()) return
    createStructureNode(name, location, chosenTemplate, {
      areaAllowance: resolved,
      workingLine
    })
  }

  const batchRows = importRows?.length ? importRows : null

  const handleCreate = (): void => {
    if (!name.trim()) return
    if (batchRows) {
      const parent = parentNode?.id ?? project?.root.id ?? ''
      const specs = importRowSpecs(batchRows)
      if (templateId) {
        createTemplatedComponentsFromImport(
          parent,
          templateId,
          specs.map((spec) => ({
            ...spec,
            alignment: (batchRows.find((row) => row.key === spec.key)?.vertices ?? [])
              .map((vertex) => ({ lat: vertex.lat, lng: vertex.lng }))
          }))
        )
      } else {
        createComponentsFromImport(parent, specs)
      }
      return
    }
    if (templateId) {
      if (line.length >= 2 && lookup) {
        createStructureNode(
          name,
          { lat: lookup.lat, lng: lookup.lng, label: name.trim() || title },
          templateId,
          { areaAllowance: allowance, workingLine: line }
        )
        return
      }
      const typedLength = Number(manualLengthM)
      if (Number.isFinite(typedLength) && typedLength > 0) {
        createStructureNode(name, null, templateId, { manualLengthM: typedLength })
      }
      return
    }
    if (!isComponent) {
      finish(undefined, null, null, null)
      return
    }
    if (!lookup || !allowance || resolvingAllowance || allowanceError) return
    finish(
      undefined,
      { lat: lookup.lat, lng: lookup.lng, label: name.trim() || title },
      allowance,
      locateMode === 'line' ? line : null
    )
  }

  // Edit mode saves one component: an upload applies its first line, a redrawn
  // line replaces the alignment, and a typed length overrides the measured one.
  const editRow = batchRows?.[0] ?? null
  const typedEditLength = Number(manualLengthM)
  const typedEditLengthM = Number.isFinite(typedEditLength) && typedEditLength > 0 ? typedEditLength : null
  const canSaveEdit = editNode !== null && (editRow
    ? !editRow.resolving && (!templateId || editRow.vertices.length >= 2)
    : templateId
      ? line.length >= 2 || typedEditLengthM !== null
      : lookup !== null && Boolean(allowance) && !resolvingAllowance && !allowanceError)

  const handleSaveEdit = (): void => {
    if (!editNode || !canSaveEdit) return
    if (!templateId) {
      if (!lookup || !allowance || resolvingAllowance || allowanceError) return
      setNodeWorkingLocation(
        editNode.id,
        { lat: lookup.lat, lng: lookup.lng, label: editNode.name },
        locateMode === 'line' ? copyVertices(line) : null,
        allowance
      )
      close()
      return
    }
    const redrawn = editRow
      ? copyVertices(editRow.vertices)
      : line.length >= 2 ? copyVertices(line) : null
    const savedLookup = editRow?.location ?? lookup ?? editNode.location ?? null
    const resolved = editRow?.allowance ?? allowance ?? editNode.areaAllowance ?? null
    setNodeWorkingLocation(
      editNode.id,
      savedLookup ? { lat: savedLookup.lat, lng: savedLookup.lng, label: editNode.name } : editNode.location ?? null,
      redrawn ?? editNode.workingLine ?? null,
      resolved
    )
    if (templateId === 'bund' && editNode.bund) {
      const current = migrateBundData(editNode.bund)
      const decided = decideTemplateEdit(redrawn, editRow ? null : typedEditLengthM, current)
      setBund(editNode.id, { ...current, alignment: decided.alignment, source: decided.source, lengthM: decided.lengthM })
    } else if (templateId === 'canal' && editNode.canal) {
      const current = migrateCanalData(editNode.canal)
      const decided = decideTemplateEdit(redrawn, editRow ? null : typedEditLengthM, current)
      setCanal(editNode.id, { ...current, alignment: decided.alignment, source: decided.source, lengthM: decided.lengthM })
    } else if (templateId === 'guide-wall' && editNode.guideWall) {
      const current = migrateGuideWallData(editNode.guideWall)
      const decided = decideTemplateEdit(redrawn, editRow ? null : typedEditLengthM, current)
      setGuideWall(editNode.id, { ...current, alignment: decided.alignment, source: decided.source, lengthM: decided.lengthM })
    }
    close()
  }

  const manualValid =
    lookup !== null && Boolean(allowance) && !resolvingAllowance && !allowanceError
  const typedLengthM = Number(manualLengthM)
  const manualLengthValid = Number.isFinite(typedLengthM) && typedLengthM > 0
  const canCreate =
    name.trim().length > 0 &&
    (batchRows
      ? !batchRows.some((row) => row.resolving) &&
        (!templateId || batchRows.every((row) => row.vertices.length >= 2))
      : templateId
        ? line.length >= 2 || manualLengthValid
        : !isComponent || manualValid)
  const createLabel = batchRows
    ? `Create ${batchRows.length} ${templateLabel ? templateLabel.toLowerCase() : 'component'}${batchRows.length === 1 ? '' : 's'}`
    : 'Create'
  const isLocatePage = isComponent && page === 2
  const goPage2 = (): void => {
    setPage(2)
    setFitToken((value) => value + 1)
  }
  const primaryDisabled = isEdit ? !canSaveEdit : !isComponent || isLocatePage ? !canCreate : !name.trim()
  const handlePrimary = isEdit ? handleSaveEdit : !isComponent || isLocatePage ? handleCreate : goPage2

  return (
    <Modal
      title={title}
      size="lg"
      onClose={close}
      footer={
        <>
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
            {isEdit
              ? <>Editing <b style={{ color: 'var(--text)' }}>{name}</b></>
              : <>Adding to <b style={{ color: 'var(--text)' }}>{parentName}</b></>}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            {isLocatePage && !isEdit && (
              <button className="btn ghost" onClick={() => setPage(1)}>
                <ArrowLeft size={15} /> Back
              </button>
            )}
            <button className="btn ghost" onClick={close}>
              Cancel
            </button>
            <button className="btn" disabled={primaryDisabled} onClick={handlePrimary}>
              {isEdit ? (<><Icon size={15} /> Save</>) : isLocatePage || !isComponent ? (<><Icon size={15} /> {createLabel}</>) : (<>Next <ArrowRight size={15} /></>)}
            </button>
          </div>
        </>
      }
    >
      {(!isComponent || page === 1) && !isEdit && (
      <>
      <div className="field">
        <label className="field-label" htmlFor="structure-name">
          Name
        </label>
        <input
          id="structure-name"
          data-tour="add-structure-name"
          ref={nameRef}
          className="text-input"
          value={name}
          placeholder={
            isComponent ? 'Enter a component name' : 'Enter a sub-component name'
          }
          autoFocus
          onChange={(event) => {
            setNameTouched(true)
            setName(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !name.trim()) return
            if (!isComponent || page === 2) handleCreate()
            else goPage2()
          }}
        />
        {name.trim() && resolvedName !== name.trim() && (
          <small style={{ color: 'var(--text-dim)', marginTop: 5 }}>
            A sibling already has that name. This one will be created as{' '}
            <strong style={{ color: 'var(--text)' }}>{resolvedName}</strong>.
          </small>
        )}
      </div>

      <div className="field" style={{ marginTop: 14 }}>
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
              <small>
                Blank {isComponent ? 'component' : 'sub-component'}: add items and pages
                yourself{isComponent ? ', with its own work point and allowance' : ''}.
              </small>
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

      </>
      )}
      {isComponent && page === 2 && (
        <div className="field" style={{ marginTop: 14 }}>
          <label className="field-label">Working geometry</label>
          {isCustomType ? (
            <div className="template-choice-list" role="group" aria-label="Working geometry mode">
              <button
                type="button"
                className={`template-choice ${locateMode === 'point' ? 'active' : ''}`}
                onClick={() => switchLocateMode('point')}
              >
                <MapPin size={16} />
                <span>
                  <strong>Keep a point</strong>
                  <small>One work point for a compact site — click the map once.</small>
                </span>
              </button>
              <button
                type="button"
                className={`template-choice ${locateMode === 'line' ? 'active' : ''}`}
                onClick={() => switchLocateMode('line')}
              >
                <Route size={16} />
                <span>
                  <strong>Draw a line</strong>
                  <small>Click along the reach — or upload a file below. Allowance is read at the middle.</small>
                </span>
              </button>
            </div>
          ) : (
            <p className="settings-note" style={{ marginTop: 0 }}>
              Draw the {templateLabel?.toLowerCase()} alignment on the map, type a
              length, or upload a file below — one {templateLabel?.toLowerCase()} per
              distinct line (branches become sub-components). Uploads need lines, not points.
            </p>
          )}
        </div>
      )}
      {isComponent && page === 2 && templateId && !batchRows && (
        <div className="field" style={{ marginTop: 14 }}>
          <label className="field-label" htmlFor="manual-length">
            Length (m) — manual (no map)
          </label>
          <input
            id="manual-length"
            className="text-input"
            type="number"
            min={0}
            placeholder={line.length >= 2 ? `Measured ${Math.round(polylineLengthM(line))} m — type to override` : 'Type the length in metres'}
            value={manualLengthM}
            onChange={(event) => setManualLengthM(event.target.value)}
          />
          <small style={{ color: 'var(--text-dim)', marginTop: 5 }}>
            Used when nothing is drawn or uploaded — the {templateLabel?.toLowerCase()} setup takes this length.
          </small>
        </div>
      )}
      {isComponent && page === 2 && (
        <GeometryImportPanel
          ref={panelRef}
          baseName={name.trim() || title}
          sorYear={sorYear}
          extendKey={extendKey}
          onToggleExtend={handleToggleExtend}
          onRowsChange={handleImportRows}
        />
      )}
      {isComponent && page === 2 && extendKey && batchRows && (
        <div className="latlng-display">
          Extend mode — click the map to append vertices to the selected line.
        </div>
      )}
      {isEdit && batchRows && batchRows.length > 1 && (
        <p className="settings-note" style={{ marginTop: 8 }}>
          Saving applies the first line only — extra lines are ignored. Create a new component to place them separately.
        </p>
      )}
      {isComponent && page === 2 && (
        <WorkingPointMap
          mode={templateId ? 'line' : locateMode}
          point={point}
          line={line}
          fitToken={fitToken}
          frozen={batchRows !== null && extendKey === null}
          overlays={(batchRows ?? []).map((row) => ({
            points: row.vertices.length >= 2 ? row.vertices : [row.location],
            color: row.color
          }))}
          onPickPoint={handleMapPickPoint}
          onAddVertex={handleMapAddVertex}
        />
      )}
      {isComponent && page === 2 && templateId && !batchRows && line.length > 0 && (
        <div className="latlng-display">
          {line.length >= 2
            ? `${line.length} vertices · ${formatLengthM(polylineLengthM(line))} measured — keep clicking to extend.`
            : 'One vertex placed — add at least one more.'}
        </div>
      )}
      {isComponent && page === 2 && !templateId && !batchRows && (
        <div className="latlng-display">
          {extendKey
            ? 'Extend mode — click the map to append vertices to the selected line.'
            : locateMode === 'point'
              ? point
                ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`
                : 'Click the map to place the work point.'
              : line.length >= 2
                ? `${line.length} vertices · ${formatLengthM(polylineLengthM(line))} measured · middle ${lookup ? `${lookup.lat.toFixed(6)}, ${lookup.lng.toFixed(6)}` : ''}`
                : line.length === 1
                  ? 'One vertex placed — add at least one more.'
                  : 'Click the map to draw the work line.'}
        </div>
      )}
      {isComponent && page === 2 && !batchRows && line.length > 0 && (
        <div className="field">
          <label className="field-label">Vertices ({line.length})</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {line.map((vertex, index) => (
              <div
                key={`${vertex.lat},${vertex.lng},${index}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span
                  style={{
                    minWidth: 22,
                    height: 22,
                    borderRadius: 11,
                    background: 'var(--accent)',
                    color: '#fff',
                    fontSize: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {index + 1}
                </span>
                <span style={{ flex: 1, fontSize: 13 }}>
                  {vertex.lat.toFixed(6)}, {vertex.lng.toFixed(6)} · {index === 0 ? 'Start' : `+${formatLengthM(lineCum[index] - lineCum[index - 1])} · ${formatLengthM(lineCum[index])} total`}
                </span>
                <button type="button" className="btn-mini" onClick={() => removeVertex(index)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" className="btn ghost compact" onClick={clearGeometry}>
              <Eraser size={14} /> Clear all
            </button>
          </div>
        </div>
      )}
      {isComponent && page === 2 && !batchRows && (
        <div className="form-section area-allowance-section">
          <h2>Area Allowance</h2>
          {resolvingAllowance ? (
            <div className="allowance-status is-loading">
              <LoaderCircle size={18} className="spin" /> Checking the work location…
            </div>
          ) : allowanceError ? (
            <div className="allowance-status is-error">{allowanceError}</div>
          ) : allowance ? (
            <div className="allowance-result">
              <div>
                <span>Allowance</span>
                <strong>{allowance.label}</strong>
              </div>
              <div>
                <span>Labour percentage</span>
                <strong>{allowance.percent.toFixed(2)}%</strong>
              </div>
              <div>
                <span>Mapped location</span>
                <strong>
                  {[
                    normalizePlaceName(allowance.village),
                    normalizePlaceName(allowance.mandal),
                    normalizePlaceName(allowance.district)
                  ]
                    .filter(Boolean)
                    .join(', ') || 'Outside a mapped allowance area'}
                </strong>
              </div>
              <div>
                <span>Rule source</span>
                <strong>
                  {allowance.ruleYear || sorYear}
                  {allowance.goReference ? ` · ${allowance.goReference}` : ''}
                </strong>
              </div>
            </div>
          ) : (
            <div className="allowance-status">{templateId ? 'Draw the line or upload a file — the allowance reads at the line middle.' : 'Place the point or draw the line to determine the allowance.'}</div>
          )}
          {allowance?.description && (
            <p className="allowance-description">{allowance.description}</p>
          )}
        </div>
      )}
    </Modal>
  )
}
