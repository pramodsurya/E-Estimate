import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ClipboardCopy,
  ListOrdered,
  Pencil,
  Plus,
  RotateCcw,
  Ruler,
  Settings2,
  Trash2,
  X
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import type {
  GuideWallData,
  GuideWallExcavationRow,
  GuideWallMaterialRef,
  GuideWallSection,
  GuideWallWallParams,
  ProjectNode
} from '../../types/project'
import {
  GUIDE_WALL_DEFAULT_BASE_CODE,
  GUIDE_WALL_DEFAULT_EXCAVATION_CODE,
  GUIDE_WALL_DEFAULT_WALL_CODE,
  baseMaterialGroups,
  chainageRangeLabel,
  copySectionDimensions,
  effectiveBaseRef,
  effectiveWallRef,
  excavationGaps,
  excavationGrandTotal,
  excavationRowLength,
  excavationRowTotal,
  formatChainage,
  hasLeftWall,
  hasRightWall,
  quantityRowsTotal,
  sideModeLabel,
  wallMaterialGroups,
  type GuideWallQtyRow
} from '../../lib/guideWall'
import { resolveNodeSettings } from '../../lib/nodeSettings'
import type { MasterItem } from '../../lib/masterData'
import { newId } from '../../lib/tree'
import MaterialPicker from '../templates/MaterialPicker'
import SsrCode from '../templates/SsrCode'
import TemplateDefaultVariantButton from '../templates/TemplateDefaultVariantButton'
import AlignmentMap from './AlignmentMap'
import SectionDiagram from './SectionDiagram'

const qty3 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })

interface Props {
  node: ProjectNode
  data: GuideWallData
  onEditSetup: (step: 1 | 2) => void
}

type MaterialRole = 'wall' | 'base' | 'excavation'

export default function GuideWallDashboard({ node, data, onEditSetup }: Props): JSX.Element {
  const setGuideWall = useStore((s) => s.setGuideWall)
  const setGuideWallMaterial = useStore((s) => s.setGuideWallMaterial)
  const resetSectionMaterial = useStore((s) => s.resetGuideWallSectionMaterial)
  const project = useStore((s) => s.project)
  const fontScale =
    (project ? resolveNodeSettings(project.root, node.id).reportFontPercent : 100) / 100

  const sections = data.sections
  const [selectedId, setSelectedId] = useState<string | null>(sections[0]?.id ?? null)
  const selected = sections.find((s) => s.id === selectedId) ?? sections[0] ?? null

  // Picker target: a default code (no sectionId) or a per-section override.
  const [picker, setPicker] = useState<{ role: MaterialRole; sectionId?: string } | null>(null)
  // Sections ticked to receive the current section's dimensions (bulk copy).
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [copyFrom, setCopyFrom] = useState('')

  const wallGroups = useMemo(() => wallMaterialGroups(data), [data])
  const baseGroups = useMemo(() => baseMaterialGroups(data), [data])
  const gaps = useMemo(() => excavationGaps(data.excavationRows, data.lengthM), [data])

  const update = (patch: Partial<GuideWallData>): void =>
    setGuideWall(node.id, { ...data, ...patch })

  const updateSection = (id: string, patch: Partial<GuideWallSection>): void =>
    update({ sections: sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) })

  const selectChainage = (ch: number): void => {
    const section = sections.find((s) => ch >= s.fromCh && ch < s.toCh + 1e-6)
    if (section) setSelectedId(section.id)
  }

  // Side-mode control: Mirror locks both walls together; with Mirror off,
  // Left and Right toggle independently (at least one stays on).
  const mirrorOn = selected?.sideMode === 'mirror'
  const leftOn = selected ? hasLeftWall(selected) : false
  const rightOn = selected ? hasRightWall(selected) : false

  const toggleMirror = (): void => {
    if (!selected) return
    if (mirrorOn) updateSection(selected.id, { sideMode: 'both' })
    else updateSection(selected.id, { sideMode: 'mirror', right: { ...selected.left } })
  }

  const toggleSide = (which: 'left' | 'right'): void => {
    if (!selected || mirrorOn) return
    const nextLeft = which === 'left' ? !leftOn : leftOn
    const nextRight = which === 'right' ? !rightOn : rightOn
    if (!nextLeft && !nextRight) return
    updateSection(selected.id, {
      sideMode: nextLeft && nextRight ? 'both' : nextLeft ? 'left' : 'right'
    })
  }

  const updateWall = (
    wall: 'left' | 'right',
    field: keyof GuideWallWallParams,
    value: number
  ): void => {
    if (!selected || !Number.isFinite(value)) return
    const params = { ...selected[wall], [field]: value }
    if (selected.sideMode === 'mirror') {
      updateSection(selected.id, { left: params, right: { ...params } })
    } else {
      updateSection(selected.id, wall === 'left' ? { left: params } : { right: params })
    }
  }

  const updateSectionNumber = (
    field: 'gap' | 'baseWidth' | 'baseThickness',
    value: number
  ): void => {
    if (!selected || !Number.isFinite(value)) return
    updateSection(selected.id, { [field]: value } as Partial<GuideWallSection>)
  }

  // Pull another section's dimensions onto the current one.
  const copyDimensions = (sourceId: string): void => {
    if (!selected) return
    const source = sections.find((s) => s.id === sourceId)
    if (!source || source.id === selected.id) return
    update({
      sections: sections.map((s) => (s.id === selected.id ? copySectionDimensions(s, source) : s))
    })
  }

  const toggleChecked = (id: string): void =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allChecked = sections.length > 0 && sections.every((s) => checked.has(s.id))
  const toggleAll = (): void =>
    setChecked(allChecked ? new Set() : new Set(sections.map((s) => s.id)))

  // The current section is the source; ticked sections other than it are the
  // targets that receive its dimensions.
  const copyTargets = sections.filter((s) => checked.has(s.id) && s.id !== selected?.id)

  const applyDimensionsToChecked = (): void => {
    if (!selected || copyTargets.length === 0) return
    const ids = new Set(copyTargets.map((t) => t.id))
    update({
      sections: sections.map((s) => (ids.has(s.id) ? copySectionDimensions(s, selected) : s))
    })
    setChecked(new Set())
  }

  const selectedIndex = selected ? sections.findIndex((s) => s.id === selected.id) : -1

  const excRows = data.excavationRows
  const setExcRow = (id: string, patch: Partial<GuideWallExcavationRow>): void =>
    update({ excavationRows: excRows.map((r) => (r.id === id ? { ...r, ...patch } : r)) })

  const materialCards: { role: MaterialRole; title: string; ref: GuideWallMaterialRef | null; hint: string }[] = [
    { role: 'wall', title: 'Wall concrete', ref: data.wallMaterial, hint: 'default for all sections' },
    { role: 'base', title: 'Base slab concrete', ref: data.baseMaterial, hint: 'default for all sections' },
    { role: 'excavation', title: 'Excavation', ref: data.excavationMaterial, hint: 'manual entry below' }
  ]
  const defaultCodeByRole: Record<MaterialRole, string> = {
    wall: GUIDE_WALL_DEFAULT_WALL_CODE,
    base: GUIDE_WALL_DEFAULT_BASE_CODE,
    excavation: GUIDE_WALL_DEFAULT_EXCAVATION_CODE
  }

  const wallFields: { field: keyof GuideWallWallParams; label: string; step: number }[] = [
    { field: 'topWidth', label: 'Top width (m)', step: 0.05 },
    { field: 'height', label: 'Height (m)', step: 0.1 },
    { field: 'faceSlope', label: 'Face slope (1 : n)', step: 0.05 }
  ]

  return (
    <div className="gw-dashboard" style={{ '--gw-font': fontScale } as React.CSSProperties}>
      <div className="gw-toolbar">
        <span className="component-section-label">
          <Ruler size={15} /> Guide wall
        </span>
        <span className="gw-badge">
          {data.sectionMode === 'continuous'
            ? `Continuous · ${formatChainage(data.intervalM)} m`
            : `Discontinuous · ${sections.length} sections`}
        </span>
        <span className="gw-badge">{formatChainage(data.lengthM)} m total</span>
        {data.source === 'manual' && <span className="gw-badge">Manual length (no map)</span>}
        <button className="btn ghost" onClick={() => onEditSetup(2)}>
          <ListOrdered size={14} /> Edit sections
        </button>
        <button className="btn ghost" onClick={() => onEditSetup(1)}>
          <Settings2 size={14} /> Edit setup
        </button>
      </div>


      <ChainageStrip data={data} selected={selected} onPick={selectChainage} />

      <div className="gw-main with-map">
        <aside className="gw-reaches">
          <div className="gw-reaches-head">
            <div className="gw-panel-label">Sections</div>
            {sections.length > 1 && (
              <label className="gw-selectall">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                Select all
              </label>
            )}
          </div>
          <div className="gw-sections-list">
            {sections.map((section, index) => (
              <div
                className={`gw-reach-row${section.id === selected?.id ? ' active' : ''}`}
                key={section.id}
              >
                {sections.length > 1 && (
                  <input
                    type="checkbox"
                    className="gw-reach-check"
                    title="Tick to copy the current section's dimensions here"
                    checked={checked.has(section.id)}
                    onChange={() => toggleChecked(section.id)}
                  />
                )}
                <button className="gw-reach-main" onClick={() => setSelectedId(section.id)}>
                  <b>
                    {index + 1} · Ch {chainageRangeLabel(section)}
                  </b>
                  <small>
                    {sideModeLabel(section.sideMode)} · H {section.left.height.toFixed(2)}
                  </small>
                </button>
              </div>
            ))}
          </div>
          {selected && sections.length > 1 && (
            <div className="gw-copy-tools">
              <button
                className="btn ghost"
                disabled={selectedIndex <= 0}
                onClick={() => selectedIndex > 0 && copyDimensions(sections[selectedIndex - 1].id)}
              >
                <ClipboardCopy size={13} /> Copy previous section
              </button>
              <select
                className="text-input"
                value={copyFrom}
                onChange={(e) => {
                  if (e.target.value) copyDimensions(e.target.value)
                  setCopyFrom('')
                }}
              >
                <option value="">Copy from a section…</option>
                {sections.map(
                  (section, index) =>
                    section.id !== selected.id && (
                      <option key={section.id} value={section.id}>
                        {index + 1} · Ch {chainageRangeLabel(section)}
                      </option>
                    )
                )}
              </select>
              {copyTargets.length > 0 && (
                <div className="gw-bulk-apply">
                  <div className="settings-note">
                    Apply <b>Ch {chainageRangeLabel(selected)}</b> to the {copyTargets.length} ticked
                    section{copyTargets.length > 1 ? 's' : ''}.
                  </div>
                  <button className="btn" onClick={applyDimensionsToChecked}>
                    <ClipboardCopy size={13} /> Apply to {copyTargets.length} selected
                  </button>
                  <button className="btn ghost" onClick={() => setChecked(new Set())}>
                    Clear selection
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>

        <section className="gw-center">
          {selected ? (
            <>
              <div className="gw-section-head">
                <span className="gw-badge">
                  Section {selectedIndex + 1} · Ch {chainageRangeLabel(selected)}
                </span>
                <div className="gw-side-tabs">
                  <button
                    className={leftOn ? 'active' : ''}
                    disabled={mirrorOn}
                    title={mirrorOn ? 'Disable Mirror to change sides' : 'Toggle the left wall'}
                    onClick={() => toggleSide('left')}
                  >
                    Left
                  </button>
                  <button
                    className={rightOn ? 'active' : ''}
                    disabled={mirrorOn}
                    title={mirrorOn ? 'Disable Mirror to change sides' : 'Toggle the right wall'}
                    onClick={() => toggleSide('right')}
                  >
                    Right
                  </button>
                  <button
                    className={mirrorOn ? 'active' : ''}
                    title="Both walls, identical — edited once, quantities × 2"
                    onClick={toggleMirror}
                  >
                    Mirror
                  </button>
                </div>
              </div>

              <SectionDiagram section={selected} />

              <div className="gw-wall-forms">
                {mirrorOn ? (
                  <div className="gw-wall-form">
                    <div className="gw-panel-label">Both walls (mirrored)</div>
                    <div className="gw-param-grid">
                      {wallFields.map(({ field, label, step }) => (
                        <label key={field}>
                          {label}
                          <input
                            className="text-input"
                            type="number"
                            step={step}
                            min={0}
                            value={selected.left[field]}
                            onChange={(e) => updateWall('left', field, Number(e.target.value))}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {leftOn && (
                      <div className="gw-wall-form">
                        <div className="gw-panel-label">Left wall</div>
                        <div className="gw-param-grid">
                          {wallFields.map(({ field, label, step }) => (
                            <label key={field}>
                              {label}
                              <input
                                className="text-input"
                                type="number"
                                step={step}
                                min={0}
                                value={selected.left[field]}
                                onChange={(e) => updateWall('left', field, Number(e.target.value))}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    {rightOn && (
                      <div className="gw-wall-form">
                        <div className="gw-panel-label">Right wall</div>
                        <div className="gw-param-grid">
                          {wallFields.map(({ field, label, step }) => (
                            <label key={field}>
                              {label}
                              <input
                                className="text-input"
                                type="number"
                                step={step}
                                min={0}
                                value={selected.right[field]}
                                onChange={(e) => updateWall('right', field, Number(e.target.value))}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="gw-wall-form">
                  <div className="gw-panel-label">Base slab & spacing</div>
                  <div className="gw-param-grid">
                    {leftOn && rightOn && (
                      <label>
                        Clear gap between walls (m)
                        <input
                          className="text-input"
                          type="number"
                          step={0.1}
                          min={0}
                          value={selected.gap}
                          onChange={(e) => updateSectionNumber('gap', Number(e.target.value))}
                        />
                      </label>
                    )}
                    <label>
                      Base width (m)
                      <input
                        className="text-input"
                        type="number"
                        step={0.1}
                        min={0}
                        value={selected.baseWidth}
                        onChange={(e) => updateSectionNumber('baseWidth', Number(e.target.value))}
                      />
                    </label>
                    <label>
                      Base height (m)
                      <input
                        className="text-input"
                        type="number"
                        step={0.05}
                        min={0}
                        value={selected.baseThickness}
                        onChange={(e) => updateSectionNumber('baseThickness', Number(e.target.value))}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="component-empty-state">No sections yet — run setup.</div>
          )}
        </section>

        <aside className="gw-map-panel">
          {data.source === 'map' && data.alignment.length >= 2 && (
            <>
              <div className="gw-panel-label">
                Alignment · Ch 0 → {formatChainage(data.lengthM)} (toposheet)
              </div>
              <AlignmentMap
                points={data.alignment}
                mode="view"
                totalLengthM={data.lengthM}
                ticks={sections.slice(0, -1).map((s) => s.toCh)}
                highlight={selected}
              />
              {selected && (
                <div className="latlng-display">
                  <span className="gw-highlight-swatch" /> Section {selectedIndex + 1} · Ch{' '}
                  {chainageRangeLabel(selected)}
                </div>
              )}
            </>
          )}

          {selected && (
            <div className="gw-section-codes">
              <div className="gw-panel-label">
                Codes for section {selectedIndex + 1} · Ch {chainageRangeLabel(selected)}
              </div>
              {(['wall', 'base'] as const).map((role) => {
                const override = role === 'wall' ? selected.wallMaterial : selected.baseMaterial
                const effective =
                  role === 'wall' ? effectiveWallRef(data, selected) : effectiveBaseRef(data, selected)
                return (
                  <div key={role} className="gw-section-code-row">
                    <span className="gw-section-code-role">
                      {role === 'wall' ? 'Wall' : 'Base'}
                    </span>
                    <SsrCode
                      code={effective.code}
                      description={effective.description}
                      className="gw-material-code"
                    />
                    <span className={`gw-code-tag ${override ? 'custom' : ''}`}>
                      {override ? 'custom' : 'default'}
                    </span>
                    <button
                      className="panel-iconbtn"
                      title="Use a different code for this section only"
                      onClick={() => setPicker({ role, sectionId: selected.id })}
                    >
                      <Pencil size={12} />
                    </button>
                    {override && (
                      <button
                        className="panel-iconbtn"
                        title="Back to the default code"
                        onClick={() => resetSectionMaterial(node.id, role, selected.id)}
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                    {picker?.role === role && picker.sectionId === selected.id && (
                      <MaterialPicker
                        onClose={() => setPicker(null)}
                        onPick={(item) => {
                          setGuideWallMaterial(node.id, role, item, selected.id)
                          setPicker(null)
                        }}
                      />
                    )}
                  </div>
                )
              })}
              <div className="settings-note">
                Changing the default above never overwrites a section marked “custom”.
              </div>
            </div>
          )}
        </aside>
      </div>

      <section className="gw-materials">
        <div className="gw-materials-title">Default codes — used by every section unless overridden</div>
        <div className="gw-materials-grid">
          {materialCards.map(({ role, title, ref, hint }) => (
            <div key={role} className="gw-material-card">
              <div className="gw-panel-label">{title}</div>
              {ref ? (
                <>
                  <SsrCode
                    code={ref.code}
                    description={ref.description}
                    className="gw-material-code"
                  />
                  <small>
                    {ref.unit ? `${ref.unit} · ` : ''}
                    {hint}
                  </small>
                  <TemplateDefaultVariantButton
                    ownerId={node.id}
                    code={ref.code}
                    defaultCode={defaultCodeByRole[role]}
                    selection={ref.dataVariant}
                  />
                </>
              ) : (
                <small>No code attached — quantities stay in this dashboard only.</small>
              )}
              <button className="btn ghost" onClick={() => setPicker({ role })}>
                <Pencil size={13} /> {ref ? 'Change default' : 'Attach code'}
              </button>
              {picker?.role === role && !picker.sectionId && (
                <MaterialPicker
                  onClose={() => setPicker(null)}
                  onPick={(item) => {
                    setGuideWallMaterial(node.id, role, item)
                    setPicker(null)
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {wallGroups.map((group) => (
        <QuantityTable
          key={`wall-${group.ref.code}`}
          title={`Computed — ${group.ref.code} (wall concrete)`}
          rows={group.rows}
          selected={selected}
          role="wall"
          isOverride={(id) => Boolean(sections.find((s) => s.id === id)?.wallMaterial)}
          editingSectionId={
            picker?.role === 'wall' && picker.sectionId ? picker.sectionId : null
          }
          onEditCode={(sectionId) => setPicker({ role: 'wall', sectionId })}
          onPickCode={(sectionId, item) => {
            setGuideWallMaterial(node.id, 'wall', item, sectionId)
            setPicker(null)
          }}
          onResetCode={(sectionId) => resetSectionMaterial(node.id, 'wall', sectionId)}
          onCancelEdit={() => setPicker(null)}
        />
      ))}
      {baseGroups.map((group) => (
        <QuantityTable
          key={`base-${group.ref.code}`}
          title={`Computed — ${group.ref.code} (base slab concrete)`}
          rows={group.rows}
          selected={selected}
          role="base"
          isOverride={(id) => Boolean(sections.find((s) => s.id === id)?.baseMaterial)}
          editingSectionId={
            picker?.role === 'base' && picker.sectionId ? picker.sectionId : null
          }
          onEditCode={(sectionId) => setPicker({ role: 'base', sectionId })}
          onPickCode={(sectionId, item) => {
            setGuideWallMaterial(node.id, 'base', item, sectionId)
            setPicker(null)
          }}
          onResetCode={(sectionId) => resetSectionMaterial(node.id, 'base', sectionId)}
          onCancelEdit={() => setPicker(null)}
        />
      ))}

      <section className="gw-panel">
        <div className="gw-panel-heading">
          <div className="gw-panel-label">
            Excavation — measured at site, entered by hand
            {data.excavationMaterial
              ? ` (writes to ${data.excavationMaterial.code})`
              : ' (attach a code above to include it in the estimate)'}
          </div>
          {gaps.length > 0 && (
            <span className="gw-gap-warning">
              <AlertTriangle size={13} /> Not covered:{' '}
              {gaps.map((gap) => `Ch ${chainageRangeLabel(gap)}`).join(', ')}
            </span>
          )}
        </div>

        <CoverageBar lengthM={data.lengthM} gaps={gaps} />

        <table className="gw-table">
          <thead>
            <tr>
              <th>S.No</th>
              <th>From Ch</th>
              <th>To Ch</th>
              <th>Length (m)</th>
              <th>Breadth (m)</th>
              <th>Height (m)</th>
              <th className="num">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {excRows.map((row, index) => {
              const autoLen = row.fromCh != null && row.toCh != null && row.toCh > row.fromCh
              return (
              <tr key={row.id}>
                <td>{index + 1}</td>
                {(['fromCh', 'toCh'] as const).map((field) => (
                  <td key={field}>
                    <input
                      className="text-input gw-cell-input"
                      type="number"
                      value={row[field] ?? ''}
                      onChange={(e) =>
                        setExcRow(row.id, {
                          [field]: e.target.value === '' ? null : Number(e.target.value)
                        })
                      }
                    />
                  </td>
                ))}
                <td>
                  <input
                    className="text-input gw-cell-input"
                    type="number"
                    title={autoLen ? 'Auto: To Ch − From Ch' : undefined}
                    disabled={autoLen}
                    value={autoLen ? (excavationRowLength(row) ?? '') : (row.length ?? '')}
                    onChange={(e) =>
                      setExcRow(row.id, { length: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                </td>
                {(['breadth', 'height'] as const).map((field) => (
                  <td key={field}>
                    <input
                      className="text-input gw-cell-input"
                      type="number"
                      value={row[field] ?? ''}
                      onChange={(e) =>
                        setExcRow(row.id, {
                          [field]: e.target.value === '' ? null : Number(e.target.value)
                        })
                      }
                    />
                  </td>
                ))}
                <td className="num">{excavationRowTotal(row) != null ? qty3.format(excavationRowTotal(row) as number) : '—'}</td>
                <td>
                  <button
                    className="panel-iconbtn"
                    title="Delete row"
                    onClick={() => update({ excavationRows: excRows.filter((r) => r.id !== row.id) })}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
              )
            })}
            <tr>
              <td colSpan={8}>
                <button
                  className="btn ghost"
                  onClick={() => {
                    const lastTo = excRows.length ? excRows[excRows.length - 1].toCh : 0
                    update({
                      excavationRows: [
                        ...excRows,
                        {
                          id: newId(),
                          fromCh: lastTo ?? null,
                          toCh: null,
                          length: null,
                          breadth: null,
                          height: null
                        }
                      ]
                    })
                  }}
                >
                  <Plus size={13} /> Add row
                </button>
              </td>
            </tr>
            <tr className="gw-total-row">
              <td colSpan={6}>Grand total</td>
              <td className="num">{qty3.format(excavationGrandTotal(excRows))}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}

function QuantityTable({
  title,
  rows,
  selected,
  role,
  isOverride,
  editingSectionId,
  onEditCode,
  onPickCode,
  onResetCode,
  onCancelEdit
}: {
  title: string
  rows: GuideWallQtyRow[]
  selected: { fromCh: number; toCh: number } | null
  role: 'wall' | 'base'
  /** True when this section carries its own code instead of the default. */
  isOverride: (sectionId: string) => boolean
  editingSectionId: string | null
  onEditCode: (sectionId: string) => void
  onPickCode: (sectionId: string, item: MasterItem) => void
  onResetCode: (sectionId: string) => void
  onCancelEdit: () => void
}): JSX.Element {
  const editingRow = editingSectionId
    ? rows.find((row) => row.sectionId === editingSectionId)
    : undefined
  return (
    <section className="gw-panel">
      <div className="gw-panel-label">{title}</div>
      <div className="gw-table-scroll">
        <table className="gw-table">
          <thead>
            <tr>
              <th>S.No</th>
              <th>Chainage</th>
              <th>Side</th>
              <th>Length (m)</th>
              <th>Calculation</th>
              <th>Code</th>
              <th className="num">Qty (cum)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const custom = isOverride(row.sectionId)
              return (
                <tr
                  key={`${row.side}-${row.fromCh}-${row.toCh}`}
                  className={
                    selected && row.fromCh < selected.toCh && row.toCh > selected.fromCh
                      ? 'gw-row-selected'
                      : undefined
                  }
                >
                  <td>{index + 1}</td>
                  <td>Ch {chainageRangeLabel(row)}</td>
                  <td>{row.side}</td>
                  <td>{qty3.format(row.lengthM)}</td>
                  <td className="gw-formula">{row.formula}</td>
                  <td>
                    <span className="gw-row-code-cell">
                      <span
                        className={`gw-row-code ${custom ? 'custom' : ''}`}
                        title={custom ? 'Custom code for this section' : 'Component default code'}
                      >
                        {row.code}
                      </span>
                      <button
                        className="panel-iconbtn"
                        title="Use a different code for this section"
                        onClick={() => onEditCode(row.sectionId)}
                      >
                        <Pencil size={11} />
                      </button>
                      {custom && (
                        <button
                          className="panel-iconbtn"
                          title="Back to the default code"
                          onClick={() => onResetCode(row.sectionId)}
                        >
                          <RotateCcw size={11} />
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="num">{qty3.format(row.qty)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {/* Rendered outside the scroll box so the dropdown is never clipped. */}
      {editingRow && (
        <div className="gw-table-picker">
          <div className="gw-panel-label">
            Code for Ch {chainageRangeLabel(editingRow)} ({role === 'wall' ? 'wall' : 'base slab'})
          </div>
          <MaterialPicker
            onClose={onCancelEdit}
            onPick={(item) => onPickCode(editingRow.sectionId, item)}
          />
        </div>
      )}
      <div className="gw-total-line">
        Grand total: <b>{qty3.format(quantityRowsTotal(rows))} cum</b> · {rows.length} rows
      </div>
    </section>
  )
}

function CoverageBar({
  lengthM,
  gaps
}: {
  lengthM: number
  gaps: { fromCh: number; toCh: number }[]
}): JSX.Element | null {
  if (lengthM <= 0) return null
  return (
    <div className="gw-coverage" title="Excavation coverage along the chainage">
      {gaps.map((gap, index) => (
        <span
          key={index}
          className="gw-coverage-gap"
          style={{
            left: `${(gap.fromCh / lengthM) * 100}%`,
            width: `${((gap.toCh - gap.fromCh) / lengthM) * 100}%`
          }}
        />
      ))}
    </div>
  )
}

function ChainageStrip({
  data,
  selected,
  onPick
}: {
  data: GuideWallData
  selected: { fromCh: number; toCh: number } | null
  onPick: (ch: number) => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const length = data.lengthM
  if (length <= 0) return <></>

  const pct = (ch: number): string => `${(ch / length) * 100}%`

  return (
    <div
      ref={ref}
      className="gw-strip"
      onClick={(e) => {
        const rect = ref.current?.getBoundingClientRect()
        if (!rect || rect.width === 0) return
        onPick(((e.clientX - rect.left) / rect.width) * length)
      }}
    >
      <div className="gw-strip-track">
        {data.sections.filter(hasLeftWall).map((section) => (
          <span
            key={section.id}
            className="gw-strip-left"
            style={{ left: pct(section.fromCh), width: pct(section.toCh - section.fromCh) }}
          />
        ))}
      </div>
      <div className="gw-strip-track">
        {data.sections.filter(hasRightWall).map((section) => (
          <span
            key={section.id}
            className="gw-strip-right"
            style={{ left: pct(section.fromCh), width: pct(section.toCh - section.fromCh) }}
          />
        ))}
      </div>
      {data.sections.slice(0, -1).map((section) => (
        <span key={section.id} className="gw-strip-tick" style={{ left: pct(section.toCh) }} />
      ))}
      {selected && (
        <span
          className="gw-strip-selected"
          style={{ left: pct(selected.fromCh), width: pct(selected.toCh - selected.fromCh) }}
        />
      )}
      <div className="gw-strip-labels">
        <span>Ch 0</span>
        {selected && (
          <span className="gw-strip-current">Ch {chainageRangeLabel(selected)}</span>
        )}
        <span>Ch {formatChainage(length)}</span>
      </div>
      <div className="gw-strip-legend">
        <span>
          <i className="gw-swatch-left" /> Left wall
        </span>
        <span>
          <i className="gw-swatch-right" /> Right wall
        </span>
      </div>
    </div>
  )
}
