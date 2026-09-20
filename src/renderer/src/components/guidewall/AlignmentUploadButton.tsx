import { useRef, useState } from 'react'
import { FilePlus2, LoaderCircle } from 'lucide-react'
import {
  analyzeImportedGeometry,
  DEFAULT_IMPORT_TOLERANCE_M,
  extractKmlFromKmz,
  parseGeoJsonGeometry,
  parseKmlGeometry,
  parseShpGeometry,
  type ParsedImportGeometry
} from '../../lib/geometryImport'

/**
 * Single-alignment upload for the Bund / Canal / Guide Wall setup maps.
 * The file goes through the same 50 m analyser used by Add Component; the
 * longest distinct line fills this node's alignment, and the note says how
 * many lines were found so the rest can be created via Add Component import.
 */
export default function AlignmentUploadButton({
  onAlignment
}: {
  onAlignment: (points: { lat: number; lng: number }[], note: string) => void
}): JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const onFile = async (file: File): Promise<void> => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const ext = file.name.toLowerCase().split('.').pop() ?? ''
      let geometry: ParsedImportGeometry
      if (ext === 'shp') {
        geometry = parseShpGeometry(await file.arrayBuffer())
      } else if (ext === 'kmz') {
        geometry = parseKmlGeometry(await extractKmlFromKmz(await file.arrayBuffer()))
      } else if (ext === 'kml') {
        geometry = parseKmlGeometry(await file.text())
      } else if (ext === 'geojson' || ext === 'json') {
        geometry = parseGeoJsonGeometry(await file.text())
      } else {
        throw new Error('Unsupported file. Upload .kml, .kmz, .geojson/.json or .shp.')
      }
      const result = analyzeImportedGeometry(geometry, DEFAULT_IMPORT_TOLERANCE_M)
      const candidates = result.proposals
        .filter((proposal) => proposal.kind === 'component' && proposal.vertices.length >= 2)
        .sort((a, b) => b.lengthM - a.lengthM)
      if (!candidates.length) {
        throw new Error('No line found. Please only upload a line KML/KMZ/GeoJSON/SHP.')
      }
      const best = candidates[0]
      const rest = result.proposals.length - 1
      const message =
        candidates.length > 1 || rest > 0
          ? `Longest of ${result.proposals.length} lines used (${Math.round(best.lengthM)} m). Create the rest via Add Component import.`
          : `Alignment loaded (${Math.round(best.lengthM)} m, ${best.vertices.length} points).`
      onAlignment(
        best.vertices.map((vertex) => ({ lat: vertex.lat, lng: vertex.lng })),
        message
      )
      setNote(message)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Could not read this file.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn ghost compact"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        title="Upload a KML, KMZ, GeoJSON or SHP line file"
      >
        {busy ? <LoaderCircle size={14} className="spin" /> : <FilePlus2 size={14} />}
        {busy ? 'Reading…' : 'Upload file'}
      </button>
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
      {error && <div className="rate-warning">{error}</div>}
      {note && <div className="settings-note">{note}</div>}
    </>
  )
}
