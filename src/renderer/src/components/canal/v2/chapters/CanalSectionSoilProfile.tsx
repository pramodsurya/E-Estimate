import { useState } from 'react'
import { Plus, RotateCcw, Copy, Trash2 } from 'lucide-react'
import type { CanalData, CanalSection, CanalSoilStratum } from '../../../../types/project'
import { orderCanalPoints, round3 } from '../../../../lib/canal'
import { formatChainage } from '../../../../lib/guideWall'
import { newId } from '../../../../lib/tree'

const n2 = (value: number | undefined | null): string =>
  (Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

interface SoilPreset {
  name: string
  color: string
  description: string
}

const STANDARD_SOIL_PRESETS: SoilPreset[] = [
  {
    name: 'All Soils + SDR',
    color: '#d97706',
    description: 'Topsoil, ordinary soil, and soft disintegrated rock'
  },
  {
    name: 'Hard Disintegrated Rock (HDR)',
    color: '#b45309',
    description: 'Weathered and disintegrated rock layers'
  },
  {
    name: 'Fissured & Fractured Rock (F&F)',
    color: '#475569',
    description: 'Fractured and fissured intermediate rock'
  },
  {
    name: 'Hard Rock (HR)',
    color: '#1e293b',
    description: 'Solid sound hard rock requiring blasting / chiselling'
  },
  {
    name: 'Ordinary Soil',
    color: '#ca8a04',
    description: 'Sandy loam, clayey soil, silt'
  },
  {
    name: 'Gravel / Murrum',
    color: '#92400e',
    description: 'Coarse gravelly soil or dense murrum'
  }
]

const DEFAULT_STRATA: Omit<CanalSoilStratum, 'id'>[] = [
  { name: 'All Soils + SDR', thickness: 1.5, slope: 1.5, color: '#d97706' },
  { name: 'Hard Disintegrated Rock (HDR)', thickness: 2.0, slope: 0.75, color: '#b45309' },
  { name: 'Fissured & Fractured Rock (F&F)', thickness: 2.5, slope: 0.5, color: '#475569' },
  { name: 'Hard Rock (HR)', thickness: 4.0, slope: 0.25, color: '#1e293b' }
]

export default function CanalSectionSoilProfile({
  section,
  sections = [],
  checkedSections = new Set(),
  onCommit
}: {
  data: CanalData
  section: CanalSection
  sections?: CanalSection[]
  checkedSections?: Set<string>
  onCommit: (update: (current: CanalData) => CanalData) => void
}): JSX.Element {
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null)

  const points = orderCanalPoints(section.ground)
  const gl =
    section.groundEntryMode === 'separate' &&
    section.leftToeRl != null &&
    section.rightToeRl != null
      ? (section.leftToeRl + section.rightToeRl) / 2
      : section.leftToeRl ?? points[0]?.rl ?? 0

  const activeStrata: CanalSoilStratum[] =
    section.strata && section.strata.length > 0
      ? section.strata
      : DEFAULT_STRATA.map((s) => ({ ...s, id: newId() }))

  const updateSectionStrata = (nextStrata: CanalSoilStratum[]): void => {
    onCommit((current) => ({
      ...current,
      sections: current.sections.map((s) =>
        s.id === section.id ? { ...s, strata: nextStrata } : s
      )
    }))
  }

  const patchStratum = (id: string, patch: Partial<CanalSoilStratum>): void => {
    const next = activeStrata.map((s) => (s.id === id ? { ...s, ...patch } : s))
    updateSectionStrata(next)
  }

  const removeStratum = (id: string): void => {
    const next = activeStrata.filter((s) => s.id !== id)
    updateSectionStrata(next)
  }

  const addStratum = (): void => {
    const newLayer: CanalSoilStratum = {
      id: newId(),
      name: 'Custom Soil Layer',
      thickness: 1.0,
      slope: 1.0,
      color: '#64748b'
    }
    updateSectionStrata([...activeStrata, newLayer])
  }

  const resetToStandardStrata = (): void => {
    const standard = DEFAULT_STRATA.map((s) => ({ ...s, id: newId() }))
    updateSectionStrata(standard)
    setCopiedMsg('Reset to standard ERM soil strata.')
    setTimeout(() => setCopiedMsg(null), 3000)
  }

  const copyToAll = (): void => {
    onCommit((current) => ({
      ...current,
      sections: current.sections.map((s) => ({
        ...s,
        strata: activeStrata.map((item) => ({ ...item, id: newId() }))
      }))
    }))
    setCopiedMsg(`Soil strata copied to all ${sections.length} cross-sections.`)
    setTimeout(() => setCopiedMsg(null), 3000)
  }

  const copyToSelected = (): void => {
    if (checkedSections.size === 0) return
    onCommit((current) => ({
      ...current,
      sections: current.sections.map((s) =>
        checkedSections.has(s.id)
          ? {
              ...s,
              strata: activeStrata.map((item) => ({ ...item, id: newId() }))
            }
          : s
      )
    }))
    setCopiedMsg(`Soil strata copied to ${checkedSections.size} selected cross-sections.`)
    setTimeout(() => setCopiedMsg(null), 3000)
  }

  const applyPreset = (id: string, preset: SoilPreset): void => {
    patchStratum(id, {
      name: preset.name,
      color: preset.color,
      description: preset.description
    })
  }

  // Calculate cumulative depths and boundary RLs
  const strataRows: Array<(typeof activeStrata)[number] & {
    fromDepth: number
    toDepth: number
    topRl: number
    bottomRl: number
  }> = []
  for (const stratum of activeStrata) {
    const previous = strataRows.at(-1)
    const fromDepth = previous?.toDepth ?? 0
    const topRl = previous?.bottomRl ?? gl
    const toDepth = round3(fromDepth + stratum.thickness)
    const bottomRl = round3(topRl - stratum.thickness)
    strataRows.push({
      ...stratum,
      fromDepth,
      toDepth,
      topRl,
      bottomRl
    })
  }

  return (
    <section className="canal-earthwork-card canal-soil-profile-card">
      <div className="canal-soil-table-wrap">
        <div className="canal-soil-table-head">
          <div>
            <div className="canal-cross-panel-title">
              Soil Strata Depth Configuration
              <small>
                Cross-section at Ch {formatChainage(section.chainage)} m · Ground Level (GL) = RL {n2(gl)} m
              </small>
            </div>
          </div>
          <div className="canal-soil-table-actions">
            {copiedMsg && <span className="canal-cross-message">{copiedMsg}</span>}
            <button type="button" className="btn ghost" onClick={addStratum}>
              <Plus size={13} /> Add Layer
            </button>
            <button type="button" className="btn ghost" onClick={resetToStandardStrata}>
              <RotateCcw size={13} /> Reset to ERM Strata
            </button>
            <button type="button" className="btn ghost" onClick={copyToAll}>
              <Copy size={13} /> Copy to All
            </button>
            {checkedSections.size > 0 && (
              <button type="button" className="btn ghost" onClick={copyToSelected}>
                <Copy size={13} /> Copy to Selected ({checkedSections.size})
              </button>
            )}
          </div>
        </div>

        <div className="canal-soil-table-container">
          <table className="canal-soil-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Stratum / Soil Class</th>
                <th>Depth from GL (m)</th>
                <th>Thickness (m)</th>
                <th>Boundary RL (m)</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {strataRows.map((row, index) => (
                <tr key={row.id}>
                  <td>
                    <span
                      className="stratum-color-dot"
                      style={{ backgroundColor: row.color || '#64748b' }}
                    />
                    {index + 1}
                  </td>
                  <td>
                    <div className="stratum-name-cell">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => patchStratum(row.id, { name: e.target.value })}
                        aria-label="Stratum name"
                      />
                      <div className="stratum-preset-dropdown">
                        <select
                          value=""
                          onChange={(e) => {
                            const preset = STANDARD_SOIL_PRESETS.find(
                              (p) => p.name === e.target.value
                            )
                            if (preset) applyPreset(row.id, preset)
                          }}
                          title="Select a standard soil/rock preset"
                        >
                          <option value="" disabled>
                            Presets ▾
                          </option>
                          {STANDARD_SOIL_PRESETS.map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="tabular-num">
                      {n2(row.fromDepth)} → {n2(row.toDepth)}
                    </span>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0.05}
                      step="any"
                      className="input-num-sm"
                      value={row.thickness}
                      onChange={(e) =>
                        patchStratum(row.id, {
                          thickness: Math.max(0.01, Number(e.target.value) || 0)
                        })
                      }
                      aria-label="Layer thickness in metres"
                    />
                  </td>
                  <td>
                    <span className="tabular-num">
                      +{n2(row.topRl)} → +{n2(row.bottomRl)}
                    </span>
                  </td>
                  <td>
                    {activeStrata.length > 1 && (
                      <button
                        type="button"
                        className="btn-icon danger"
                        onClick={() => removeStratum(row.id)}
                        title="Remove this stratum"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
