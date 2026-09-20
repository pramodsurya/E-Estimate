import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { FilePlus2, LoaderCircle, Trash2, X } from 'lucide-react'
import { resolveAreaAllowance } from '../../lib/masterData'
import { workingLineCentroid } from '../../lib/componentAllowance'
import {
  analyzeImportedGeometry,
  decodeUploadText,
  DEFAULT_IMPORT_TOLERANCE_M,
  extractKmlFromKmz,
  IMPORT_TOLERANCES_M,
  looksLikeZip,
  middleOfLine,
  parseGeoJsonGeometry,
  parseKmlGeometry,
  parseShpGeometry,
  polylineLengthM,
  trimLine,
  type ImportAnalysis,
  type ImportedComponentSpec,
  type ImportVertex,
  type ParsedImportGeometry
} from '../../lib/geometryImport'
import type { ProjectAreaAllowance } from '../../types/project'
import { formatLengthM } from '../../lib/guideWall'

export interface ImportProposalRow {
  key: string
  name: string
  kind: 'component' | 'subcomponent'
  parentKey: string | null
  /** Trimmed working line; empty for point-components. */
  vertices: ImportVertex[]
  baseVertices: ImportVertex[]
  trimStartM: number
  trimEndM: number
  lengthM: number
  location: ImportVertex
  allowance: ProjectAreaAllowance | null
  resolving: boolean
  color: string
  note: string | null
}

export function importRowSpecs(rows: ImportProposalRow[]): ImportedComponentSpec[] {
  return rows.map((row) => ({
    key: row.key,
    name: row.name.trim() || row.key,
    kind: row.kind,
    parentKey: row.parentKey,
    location: { lat: row.location.lat, lng: row.location.lng, label: row.name.trim() || undefined },
    workingLine: row.vertices.length >= 2
      ? row.vertices.map((vertex) => ({ lat: vertex.lat, lng: vertex.lng }))
      : null,
    allowance: row.allowance
  }))
}

const ROW_COLORS = ['#0e639c', '#1e8449', '#b03a2e', '#b7950b', '#2e86c1']

function chainageLabel(lengthM: number): string {
  return `ch 0–${Math.round(lengthM)}`
}

export interface GeometryImportPanelHandle {
  appendVertex: (key: string, vertex: ImportVertex) => void
  removeRowVertex: (key: string, index: number) => void
}

interface GeometryImportPanelProps {
  baseName: string
  sorYear: string
  extendKey: string | null
  onToggleExtend: (key: string | null) => void
  onRowsChange: (rows: ImportProposalRow[] | null) => void
}

const GeometryImportPanel = forwardRef<GeometryImportPanelHandle, GeometryImportPanelProps>(
  function GeometryImportPanel(
    { baseName, sorYear, extendKey, onToggleExtend, onRowsChange },
    ref
  ) {
  const fileRef = useRef<HTMLInputElement>(null)
  const rowTokens = useRef<Record<string, number>>({})
  const [fileName, setFileName] = useState<string | null>(null)
  const [toleranceM, setToleranceM] = useState<number>(DEFAULT_IMPORT_TOLERANCE_M)
  const [parsed, setParsed] = useState<ParsedImportGeometry | null>(null)
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null)
  const [rows, setRows] = useState<ImportProposalRow[] | null>(null)
  const [removedKeys, setRemovedKeys] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeRows = rows?.filter((row) => !removedKeys.includes(row.key)) ?? null
  useEffect(() => {
    onRowsChange(activeRows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, removedKeys])
  useEffect(
    () => () => {
      // Leaving Draw a line mode unmounts the panel: release the proposal so
      // the map and footer fall back to manual placement.
      onRowsChange(null)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const resolveRowAllowance = (key: string, lookup: ImportVertex): void => {
    const token = (rowTokens.current[key] ?? 0) + 1
    rowTokens.current[key] = token
    setRows((current) =>
      current?.map((row) => (row.key === key ? { ...row, resolving: true } : row)) ?? null
    )
    void resolveAreaAllowance({ lat: lookup.lat, lng: lookup.lng }, sorYear)
      .then((resolved) => {
        if (rowTokens.current[key] !== token) return
        setRows((current) =>
          current?.map((row) =>
            row.key === key ? { ...row, allowance: resolved, resolving: false } : row
          ) ?? null
        )
      })
      .catch(() => {
        if (rowTokens.current[key] !== token) return
        setRows((current) =>
          current?.map((row) =>
            row.key === key ? { ...row, allowance: null, resolving: false } : row
          ) ?? null
        )
      })
  }

  const buildRows = (
    result: ImportAnalysis,
    keepNames: Record<string, string>,
    keepRemoved: string[]
  ): void => {
    const cleanBase = baseName.trim() || 'Imported Component'
    const reachOf = new Map<string, number>()
    let reach = 0
    let pointCount = 0
    for (const proposal of result.proposals) {
      if (proposal.kind === 'component' && proposal.vertices.length > 0) {
        reach += 1
        reachOf.set(proposal.key, reach)
      } else if (proposal.vertices.length === 0) {
        pointCount += 1
        reachOf.set(proposal.key, -pointCount)
      }
    }
    const branchCount = new Map<string, number>()
    let colorIndex = 0
    const next: ImportProposalRow[] = result.proposals.map((proposal) => {
      let name = keepNames[proposal.key] ?? ''
      if (!name) {
        if (proposal.kind === 'subcomponent') {
          const count = (branchCount.get(proposal.parentKey ?? '') ?? 0) + 1
          branchCount.set(proposal.parentKey ?? '', count)
          const parentReach = reachOf.get(proposal.parentKey ?? '')
          name = `${cleanBase} · Branch ${count}${parentReach && parentReach > 0 ? ` of Reach ${parentReach}` : ''}`
        } else if (proposal.vertices.length > 0) {
          name = `${cleanBase} · Reach ${reachOf.get(proposal.key) ?? ''}`.trim()
        } else {
          name = `${cleanBase} · Point ${Math.abs(reachOf.get(proposal.key) ?? 1)}`
        }
      }
      const color = ROW_COLORS[colorIndex++ % ROW_COLORS.length]
      const location = proposal.point
      return {
        key: proposal.key,
        name,
        kind: proposal.kind,
        parentKey: proposal.parentKey,
        vertices: proposal.vertices,
        baseVertices: proposal.vertices,
        trimStartM: 0,
        trimEndM: 0,
        lengthM: proposal.lengthM,
        location,
        allowance: null,
        resolving: true,
        color,
        note: proposal.note
      }
    })
    setRemovedKeys(keepRemoved)
    setRows(next)
    for (const row of next) {
      const lookup = row.vertices.length >= 2
        ? middleOfLine(row.vertices)
        : row.location
      resolveRowAllowance(row.key, lookup)
    }
  }

  const rebuild = (geometry: ParsedImportGeometry, tolerance: number): void => {
    const names: Record<string, string> = {}
    for (const row of rows ?? []) names[row.key] = row.name
    const result = analyzeImportedGeometry(geometry, tolerance)
    setAnalysis(result)
    if (!result.proposals.length) {
      setRows(null)
      setRemovedKeys([])
      return
    }
    buildRows(result, names, removedKeys)
  }

  const reset = (): void => {
    setFileName(null)
    setParsed(null)
    setAnalysis(null)
    setRows(null)
    setRemovedKeys([])
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const onFile = async (file: File): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const ext = file.name.toLowerCase().split('.').pop() ?? ''
      let geometry: ParsedImportGeometry
      if (ext === 'shp') {
        geometry = parseShpGeometry(await file.arrayBuffer())
      } else if (ext === 'kmz') {
        // A .kmz that is really plain KML falls back to the KML reader.
        const buffer = await file.arrayBuffer()
        try {
          geometry = parseKmlGeometry(await extractKmlFromKmz(buffer))
        } catch {
          geometry = parseKmlGeometry(decodeUploadText(buffer))
        }
      } else if (ext === 'kml') {
        // A .kml that is really a KMZ archive is unzipped first.
        const buffer = await file.arrayBuffer()
        geometry = looksLikeZip(buffer)
          ? parseKmlGeometry(await extractKmlFromKmz(buffer))
          : parseKmlGeometry(decodeUploadText(buffer))
      } else if (ext === 'geojson' || ext === 'json') {
        geometry = parseGeoJsonGeometry(await file.text())
      } else {
        throw new Error('Unsupported file. Upload .kml, .kmz, .geojson/.json or .shp.')
      }
      setParsed(geometry)
      setFileName(file.name)
      const names: Record<string, string> = {}
      const result = analyzeImportedGeometry(geometry, toleranceM)
      setAnalysis(result)
      if (!result.proposals.length) {
        setRows(null)
        setRemovedKeys([])
        return
      }
      buildRows(result, names, [])
    } catch (reason: unknown) {
      reset()
      setError(reason instanceof Error ? reason.message : 'Could not read this file.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const changeTolerance = (value: number): void => {
    setToleranceM(value)
    if (parsed) rebuild(parsed, value)
  }

  const renameRow = (key: string, name: string): void => {
    setRows((current) =>
      current?.map((row) => (row.key === key ? { ...row, name } : row)) ?? null
    )
  }

  const removeRow = (key: string): void => {
    setRemovedKeys((current) => {
      const cascade = [key]
      for (const row of rows ?? []) {
        if (row.parentKey === key) cascade.push(row.key)
      }
      return [...current, ...cascade.filter((candidate) => !current.includes(candidate))]
    })
  }

  const changeTrim = (key: string, which: 'start' | 'end', value: number): void => {
    const row = rows?.find((candidate) => candidate.key === key)
    if (!row || row.baseVertices.length < 2) return
    const full = polylineLengthM(row.baseVertices)
    const maxTotal = Math.max(0, full - 1)
    const clamped = Math.max(0, Math.min(Number.isFinite(value) ? value : 0, maxTotal))
    let trimStartM = which === 'start' ? clamped : row.trimStartM
    let trimEndM = which === 'end' ? clamped : row.trimEndM
    if (trimStartM + trimEndM > maxTotal) {
      if (which === 'start') trimEndM = Math.max(0, maxTotal - trimStartM)
      else trimStartM = Math.max(0, maxTotal - trimEndM)
    }
    const vertices = trimLine(row.baseVertices, trimStartM, trimEndM)
    const lengthM = polylineLengthM(vertices)
    const location = vertices.length >= 2 ? middleOfLine(vertices) : row.location
    setRows((current) =>
      current?.map((candidate) =>
        candidate.key === key
          ? { ...candidate, trimStartM, trimEndM, vertices, lengthM, location }
          : candidate
      ) ?? null
    )
    const centroid = workingLineCentroid(
      vertices.map((vertex) => ({ lat: vertex.lat, lng: vertex.lng }))
    ) ?? location
    resolveRowAllowance(key, centroid)
  }

  const recalcRow = (
    row: ImportProposalRow,
    baseVertices: ImportVertex[]
  ): ImportProposalRow => {
    const maxTotal = Math.max(0, polylineLengthM(baseVertices) - 1)
    const trimStartM = Math.min(row.trimStartM, maxTotal)
    const trimEndM = Math.min(row.trimEndM, Math.max(0, maxTotal - trimStartM))
    const vertices = trimLine(baseVertices, trimStartM, trimEndM)
    const lengthM = polylineLengthM(vertices)
    const location = vertices.length >= 2
      ? middleOfLine(vertices)
      : baseVertices[0] ?? row.location
    return { ...row, baseVertices, trimStartM, trimEndM, vertices, lengthM, location }
  }

  const commitBaseVertices = (key: string, baseVertices: ImportVertex[]): void => {
    const row = rows?.find((candidate) => candidate.key === key)
    if (!row) return
    const recalculated = recalcRow(row, baseVertices)
    setRows((current) =>
      current?.map((candidate) =>
        candidate.key === key ? { ...recalculated, resolving: true } : candidate
      ) ?? null
    )
    const centroid = workingLineCentroid(
      baseVertices.map((vertex) => ({ lat: vertex.lat, lng: vertex.lng }))
    ) ?? recalculated.location
    resolveRowAllowance(key, centroid)
  }

  const appendVertex = (key: string, vertex: ImportVertex): void => {
    const row = rows?.find((candidate) => candidate.key === key)
    if (!row || !row.baseVertices.length) return
    commitBaseVertices(key, [...row.baseVertices, vertex])
  }

  const removeRowVertex = (key: string, index: number): void => {
    const row = rows?.find((candidate) => candidate.key === key)
    if (!row || row.baseVertices.length <= 2) return
    commitBaseVertices(
      key,
      row.baseVertices.filter((_, vertexIndex) => vertexIndex !== index)
    )
  }

  useImperativeHandle(ref, () => ({ appendVertex, removeRowVertex }), [rows, sorYear])

  const componentCount = activeRows?.filter((row) => row.kind === 'component').length ?? 0
  // Per-vertex distance labels for the expandable vertex lists: first vertex
  // reads Start, every later one shows its segment and running total. Labels
  // refresh live while trimming or extending a line.
  const cumLabelByRow = useMemo(() => {
    const labels = new Map<string, string[]>()
    for (const row of rows ?? []) {
      let run = 0
      let prev = 0
      labels.set(
        row.key,
        row.baseVertices.map((vertex, vertexIndex) => {
          if (vertexIndex > 0) {
            prev = run
            run += polylineLengthM([row.baseVertices[vertexIndex - 1], vertex])
          }
          return vertexIndex === 0
            ? 'Start'
            : `+${formatLengthM(run - prev)} · ${formatLengthM(run)} total`
        })
      )
    }
    return labels
  }, [rows])

  return (
    <div className="field">
      <label className="field-label">Import line file</label>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn ghost compact"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <FilePlus2 size={14} /> {busy ? 'Reading…' : 'Upload KML / KMZ / GeoJSON / SHP'}
        </button>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          Join within
          <select
            className="select-input"
            value={toleranceM}
            disabled={busy}
            onChange={(event) => changeTolerance(Number(event.target.value))}
            style={{ width: 'auto' }}
          >
            {IMPORT_TOLERANCES_M.map((option) => (
              <option key={option} value={option}>
                {option} m
              </option>
            ))}
          </select>
        </label>
        {fileName && (
          <button type="button" className="btn ghost compact" disabled={busy} onClick={reset}>
            <X size={14} /> Discard
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".kml,.kmz,.geojson,.json,.shp"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void onFile(file)
          }}
        />
      </div>
      {fileName && (
        <small style={{ color: 'var(--text-dim)', marginTop: 5, display: 'block' }}>
          File: {fileName}
          {fileName.toLowerCase().endsWith('.kmz') ? ' (KML inside the archive, lines only)' : ''}
        </small>
      )}
      {busy && (
        <div className="allowance-status is-loading" style={{ marginTop: 8 }}>
          <LoaderCircle size={16} className="spin" /> Reading the file…
        </div>
      )}
      {error && (
        <div className="rate-warning" style={{ marginTop: 8 }}>{error}</div>
      )}
      {analysis && !analysis.proposals.length && !busy && (
        <div className="allowance-status" style={{ marginTop: 8 }}>
          No line found. KML lines, GPS tracks and polygon boundaries (or GeoJSON/SHP lines) are read — points alone cannot form a component.
        </div>
      )}
      {analysis && analysis.assumptions.length > 0 && (
        <ul className="settings-note" style={{ marginTop: 8, paddingLeft: 18 }}>
          {analysis.assumptions.map((assumption, index) => (
            <li key={index}>{assumption}</li>
          ))}
        </ul>
      )}
      {activeRows && activeRows.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <p className="settings-note" style={{ marginTop: 0 }}>
            {activeRows.length} component{activeRows.length === 1 ? '' : 's'} will be created
            {componentCount !== activeRows.length
              ? ` (${componentCount} component${componentCount === 1 ? '' : 's'}, ${activeRows.length - componentCount} sub-component${activeRows.length - componentCount === 1 ? '' : 's'})`
              : ''}. Remove the ones you do not want.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeRows.map((row) => (
              <article key={row.key} className="created-data-card">
                <div className="created-data-card-heading">
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      background: row.color,
                      display: 'inline-block'
                    }}
                  />
                  <input
                    className="text-input"
                    value={row.name}
                    onChange={(event) => renameRow(row.key, event.target.value)}
                    aria-label="Proposed component name"
                    style={{ flex: 1 }}
                  />
                  <small>{row.kind === 'component' ? 'Component' : 'Sub-component'}</small>
                  <button
                    type="button"
                    className="btn-mini"
                    onClick={() => removeRow(row.key)}
                    title="Remove this proposed component"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {row.note && <p style={{ fontSize: 12 }}>{row.note}</p>}
                <div className="created-data-card-footer" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <span>
                    {row.vertices.length >= 2 ? chainageLabel(row.lengthM) : 'Work point'}
                    <b> · {row.lengthM.toFixed(0)} m</b>
                  </span>
                  <span>
                    {row.resolving
                      ? 'Resolving allowance…'
                      : row.allowance
                        ? `${row.allowance.label} · ${row.allowance.percent.toFixed(2)}%`
                        : 'Allowance unavailable'}
                  </span>
                </div>
                {row.baseVertices.length >= 2 && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                      First trim (m)
                      <input
                        className="text-input"
                        type="number"
                        min={0}
                        max={Math.max(0, polylineLengthM(row.baseVertices) - 1)}
                        step="any"
                        value={Number.isFinite(row.trimStartM) ? row.trimStartM : 0}
                        onChange={(event) => changeTrim(row.key, 'start', Number(event.target.value))}
                        style={{ width: 90 }}
                      />
                    </label>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                      Last trim (m)
                      <input
                        className="text-input"
                        type="number"
                        min={0}
                        max={Math.max(0, polylineLengthM(row.baseVertices) - 1)}
                        step="any"
                        value={Number.isFinite(row.trimEndM) ? row.trimEndM : 0}
                        onChange={(event) => changeTrim(row.key, 'end', Number(event.target.value))}
                        style={{ width: 90 }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn ghost compact"
                      onClick={() => onToggleExtend(extendKey === row.key ? null : row.key)}
                      title="Click the map to append vertices to the end of this line"
                    >
                      {extendKey === row.key ? 'Stop extending' : 'Extend line'}
                    </button>
                  </div>
                )}
                {row.baseVertices.length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ fontSize: 12, cursor: 'pointer' }}>
                      Vertices ({row.baseVertices.length})
                    </summary>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                      {row.baseVertices.map((vertex, vertexIndex) => (
                        <div
                          key={`${vertex.lat},${vertex.lng},${vertexIndex}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
                        >
                          <span style={{ flex: 1 }}>
                            {vertexIndex + 1}. {vertex.lat.toFixed(6)}, {vertex.lng.toFixed(6)} · {cumLabelByRow.get(row.key)?.[vertexIndex] ?? ''}
                          </span>
                          <button
                            type="button"
                            className="btn-mini"
                            disabled={row.baseVertices.length <= 2}
                            onClick={() => removeRowVertex(row.key, vertexIndex)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  )
  }
)

export default GeometryImportPanel
