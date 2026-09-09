import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { BundData, BundSoilBand, TemplateMaterialRef } from '../../../../types/project'
import {
  BUND_DEFAULT_CLEARANCE_CODE,
  clearanceManualRowArea,
  clearanceTotal,
  defaultBundExcavationRows,
  rowsTotal,
  strippingRows,
  withStrippingExcavationFamily
} from '../../../../lib/bund'
import { newId } from '../../../../lib/tree'
import MaterialPicker from '../../../templates/MaterialPicker'
import SsrCode from '../../../templates/SsrCode'

const n3 = (value: number): string =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 3 })

function DraftNumber({
  value,
  onCommit,
  allowBlank = false,
  min,
  max
}: {
  value: number | null
  onCommit: (value: number | null) => void
  allowBlank?: boolean
  min?: number
  max?: number
}): JSX.Element {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(value == null ? '' : String(value))
  }, [value])

  const commit = (): void => {
    if (!draft.trim() && allowBlank) {
      onCommit(null)
      return
    }
    const parsed = Number(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(value == null ? '' : String(value))
      return
    }
    const bounded = Math.min(max ?? parsed, Math.max(min ?? parsed, parsed))
    if (bounded !== value) onCommit(bounded)
    setDraft(String(bounded))
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onFocus={() => { focused.current = true }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        focused.current = false
        commit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(value == null ? '' : String(value))
          event.currentTarget.blur()
        }
      }}
    />
  )
}

const materialFromItem = (item: {
  code: string
  description: string
  unit?: string | null
  category: string
  side?: TemplateMaterialRef['side']
  dataVariant?: TemplateMaterialRef['dataVariant']
}): TemplateMaterialRef => ({
  code: item.code,
  description: item.description,
  unit: item.dataVariant?.unit ?? item.unit,
  categoryKey: item.category,
  side: item.side,
  dataVariant: item.dataVariant
})

export default function FoundationExcavationClearance({
  data,
  onCommit
}: {
  data: BundData
  onCommit: (update: (current: BundData) => BundData) => void
}): JSX.Element {
  const [picker, setPicker] = useState<'clearance' | string | null>(null)
  const family = data.strippingExcavationFamily ?? 'seating'
  const bands = data.excavationBands?.stripping ??
    defaultBundExcavationRows(undefined, family === 'foundation' ? 'foundation' : 'channel')
  const excavationTotal = useMemo(() => rowsTotal(strippingRows(data)), [data])
  const jungleTotal = useMemo(() => clearanceTotal(data), [data])
  const totalPct = bands.reduce((sum, band) => sum + (band.pct || 0), 0)
  const repair = data.mode === 'restoration'
  const excavationLabel = repair ? 'Stripping / corrective cut' : 'Bund Foundation Excavation'

  const patchBands = (nextBands: BundSoilBand[]): void => onCommit((current) => ({
    ...current,
    strippingMaterial: nextBands[0]?.material ?? current.strippingMaterial,
    excavationBands: { ...current.excavationBands, stripping: nextBands }
  }))

  const switchFamily = (next: BundData['strippingExcavationFamily']): void =>
    onCommit((current) => ({ ...current, ...withStrippingExcavationFamily(current, next) }))

  const selectClearanceMode = (mode: BundData['clearanceMode']): void =>
    onCommit((current) => ({
      ...current,
      clearanceMode: mode,
      ...(mode === 'manual' && current.clearanceManualRows.length === 0
        ? { clearanceManualRows: [{ id: newId(), length: null, breadth: null }] }
        : {})
    }))

  return (
    <section className="bund-v2-section" aria-labelledby="bund-v2-foundation-title">
      <header className="bund-v2-section-header">
        <div>
          <span className="bund-v2-section-kicker">Ground preparation</span>
          <h2 id="bund-v2-foundation-title">4. {repair ? 'Stripping / Cut' : 'Foundation Excavation'} &amp; Jungle Clearance</h2>
          <p>{repair
            ? 'Classify only the surveyed material removed above the proposed repaired profile, then choose how the cleared plan area is measured.'
            : 'Set the excavation classification and choose how the cleared plan area is measured.'}</p>
        </div>
        <span className="bund-v2-save-state">Saved</span>
      </header>

      <div className="bund-v2-foundation-layout">
        <section className="bund-v2-foundation-card">
          <div className="bund-v2-panel-title">{excavationLabel}</div>

          <div className="bund-v2-excavation-basis" role="radiogroup" aria-label="Excavation code basis">
            <span>Excavation basis</span>
            <label className={family === 'seating' ? 'is-selected' : ''}>
              <input
                type="radio"
                checked={family === 'seating'}
                onChange={() => switchFamily('seating')}
              />
              <span><strong>{excavationLabel}</strong><small>CAW excavation codes</small></span>
            </label>
            <label className={family === 'foundation' ? 'is-selected' : ''}>
              <input
                type="radio"
                checked={family === 'foundation'}
                onChange={() => switchFamily('foundation')}
              />
              <span><strong>{excavationLabel}</strong><small>DAW excavation codes</small></span>
            </label>
          </div>

          <label className="bund-v2-foundation-depth">
            <span>{repair ? 'Strip depth where material is cut (m)' : 'Foundation excavation depth (m)'}</span>
            <DraftNumber
              value={data.design.stripDepth}
              min={0}
              onCommit={(stripDepth) => stripDepth != null && onCommit((current) => ({
                ...current,
                design: { ...current.design, stripDepth }
              }))}
            />
          </label>

          <section className="bund-v2-excavation-classes">
            <header>
              <div>
                <strong>{excavationLabel}</strong>
                <small>{repair
                  ? 'Only the surveyed excess above the repair design is measured and classified.'
                  : 'Measured cut classified using the selected excavation-code basis.'}</small>
              </div>
              <div className="bund-v2-excavation-summary">
                <strong>{n3(excavationTotal)} cu.m</strong>
                <span className={Math.abs(totalPct - 100) > 0.01 ? 'is-warning' : ''}>
                  {n3(totalPct)}% {Math.abs(totalPct - 100) > 0.01 ? '!' : '✓'}
                </span>
              </div>
            </header>

            <div className="bund-v2-excavation-table">
              {bands.map((band, index) => (
                <div className="bund-v2-excavation-row" key={band.id}>
                  {index < 4 ? (
                    <strong>{band.label}</strong>
                  ) : (
                    <input
                      value={band.label}
                      aria-label="Excavation class"
                      onChange={(event) => patchBands(bands.map((candidate) =>
                        candidate.id === band.id ? { ...candidate, label: event.target.value } : candidate
                      ))}
                    />
                  )}
                  <span className="bund-v2-percent-field">
                    <DraftNumber
                      value={band.pct}
                      min={0}
                      max={100}
                      onCommit={(pct) => pct != null && patchBands(bands.map((candidate) =>
                        candidate.id === band.id ? { ...candidate, pct } : candidate
                      ))}
                    />
                    <span>%</span>
                  </span>
                  <button
                    type="button"
                    className="btn ghost bund-v2-excavation-code"
                    onClick={() => setPicker(band.id)}
                  >
                    {band.material.code ? (
                      <SsrCode code={band.material.code} description={band.material.description} />
                    ) : (
                      'Select code'
                    )}
                  </button>
                  <span>{n3((excavationTotal * band.pct) / 100)} cu.m</span>
                  {index >= 4 ? (
                    <button
                      type="button"
                      className="bund-v2-icon-button"
                      aria-label={`Remove ${band.label || 'excavation'} code`}
                      onClick={() => patchBands(bands.filter((candidate) => candidate.id !== band.id))}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : <span />}
                  {picker === band.id && (
                    <MaterialPicker
                      initialCategory={family === 'foundation' ? 'IRR-DAW' : 'IRR-CAW'}
                      initialSearch={family === 'foundation' ? 'excavation foundation' : 'excavation bund seating'}
                      onClose={() => setPicker(null)}
                      onPick={(item) => {
                        patchBands(bands.map((candidate) => candidate.id === band.id
                          ? { ...candidate, material: materialFromItem(item) }
                          : candidate
                        ))
                        setPicker(null)
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn ghost"
              onClick={() => patchBands([
                ...bands,
                { id: newId(), label: 'Other', pct: 0, material: { code: '' } }
              ])}
            >
              <Plus size={13} /> Add code
            </button>
          </section>

          <div className="bund-v2-formula">
            The default is <strong>All Soils 100%</strong>. Use HDR, F&amp;F and HR only when the
            measured cut enters those strata. Select CAW only when required by the approved specification.
          </div>
        </section>

        <aside className="bund-v2-clearance-column">
          <section className="bund-v2-clearance-code-card">
            <div className="bund-v2-panel-title">Jungle Clearance</div>
            {data.clearanceMaterial ? (
              <>
                <strong className="bund-v2-clearance-code">
                  <SsrCode code={data.clearanceMaterial.code} description={data.clearanceMaterial.description} />
                </strong>
                <small>
                  {data.clearanceMaterial.unit ? `${data.clearanceMaterial.unit} · ` : ''}
                  Plan area cleared along the bund.
                </small>
              </>
            ) : (
              <small>Not billed — no jungle-clearance item is generated.</small>
            )}
            <div className="bund-v2-clearance-actions">
              <button type="button" className="btn ghost" onClick={() => setPicker('clearance')}>
                <Pencil size={13} /> {data.clearanceMaterial ? 'Change code' : 'Attach code'}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => onCommit((current) => ({
                  ...current,
                  clearanceMaterial: current.clearanceMaterial
                    ? null
                    : { code: BUND_DEFAULT_CLEARANCE_CODE }
                }))}
              >
                {data.clearanceMaterial ? 'Remove' : 'Add back'}
              </button>
            </div>
            {picker === 'clearance' && (
              <MaterialPicker
                initialCategory="IRR-PMW"
                initialSearch="jungle clearance"
                onClose={() => setPicker(null)}
                onPick={(item) => {
                  onCommit((current) => ({ ...current, clearanceMaterial: materialFromItem(item) }))
                  setPicker(null)
                }}
              />
            )}
          </section>

          {data.clearanceMaterial && (
            <section className="bund-v2-clearance-measure">
              <header>
                <div><strong>How it is measured</strong><small>Choose the applicable plan-area method.</small></div>
                <strong>{n3(jungleTotal)} sq.m</strong>
              </header>
              <div className="bund-v2-clearance-modes">
                <label className={data.clearanceMode === 'perimeter' ? 'is-selected' : ''}>
                  <input
                    type="radio"
                    checked={data.clearanceMode === 'perimeter'}
                    onChange={() => selectClearanceMode('perimeter')}
                  />
                  <span><strong>Automatic</strong><small>Average width at stripped level × chainage length.</small></span>
                </label>
                <label className={data.clearanceMode === 'manual' ? 'is-selected' : ''}>
                  <input
                    type="radio"
                    checked={data.clearanceMode === 'manual'}
                    onChange={() => selectClearanceMode('manual')}
                  />
                  <span><strong>Manual patches</strong><small>Length × breadth for each cleared patch.</small></span>
                </label>
              </div>
            </section>
          )}
        </aside>
      </div>

      {data.clearanceMaterial && data.clearanceMode === 'manual' && (
        <section className="bund-v2-clearance-table-card">
          <header>
            <div>
              <div className="bund-v2-panel-title">Manual Jungle-Clearance Patches</div>
              <small>This table is shown only while Manual patches is selected.</small>
            </div>
            <strong>{n3(jungleTotal)} sq.m</strong>
          </header>
          <div className="bund-v2-clearance-table">
            <div className="bund-v2-clearance-table-head">
              <span>Patch</span><span>Length (m)</span><span>Breadth (m)</span><span>Area (sq.m)</span><span />
            </div>
            {data.clearanceManualRows.map((row, index) => (
              <div className="bund-v2-clearance-table-row" key={row.id}>
                <strong>{index + 1}</strong>
                <DraftNumber
                  value={row.length}
                  allowBlank
                  min={0}
                  onCommit={(length) => onCommit((current) => ({
                    ...current,
                    clearanceManualRows: current.clearanceManualRows.map((candidate) =>
                      candidate.id === row.id ? { ...candidate, length } : candidate
                    )
                  }))}
                />
                <DraftNumber
                  value={row.breadth}
                  allowBlank
                  min={0}
                  onCommit={(breadth) => onCommit((current) => ({
                    ...current,
                    clearanceManualRows: current.clearanceManualRows.map((candidate) =>
                      candidate.id === row.id ? { ...candidate, breadth } : candidate
                    )
                  }))}
                />
                <strong>{n3(clearanceManualRowArea(row))}</strong>
                <button
                  type="button"
                  className="bund-v2-icon-button"
                  aria-label={`Delete patch ${index + 1}`}
                  onClick={() => onCommit((current) => ({
                    ...current,
                    clearanceManualRows: current.clearanceManualRows.filter((candidate) => candidate.id !== row.id)
                  }))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => onCommit((current) => ({
              ...current,
              clearanceManualRows: [
                ...current.clearanceManualRows,
                { id: newId(), length: null, breadth: null }
              ]
            }))}
          >
            <Plus size={13} /> Add patch
          </button>
        </section>
      )}
    </section>
  )
}
