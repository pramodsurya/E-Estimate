import { useState } from 'react'
import {
  Check,
  Copy,
  FileCode,
  Image as ImageIcon,
  Layers,
  Plus,
  Sparkles,
  Variable
} from 'lucide-react'
import { buildAiPrompt, statementDataRoot } from '../../lib/typist-output/aiPromptBuilder'
import {
  DEFAULT_DOCUMENT_SETTINGS,
  type DocumentSettings
} from '../../lib/typist-output/documentSettings'
import './mediaVariablesGallery.css'

export interface MediaGalleryItem {
  id: string
  name: string
  path: string
  left?: number
  top?: number
  relLeftPx?: number
  relTopPx?: number
  width: number
  height: number
  type: 'drawing' | 'chart'
  typstSnippet?: string
  previewUrl?: string
}

export interface MediaVariablesGalleryProps {
  runtimeData?: unknown
  typstSource?: string
  variableRootName?: string
  onInsertCode?: (snippet: string) => void
  onClose?: () => void
  documentSettings?: DocumentSettings
}

export default function MediaVariablesGallery({
  runtimeData,
  typstSource,
  variableRootName,
  onInsertCode,
  onClose,
  documentSettings
}: MediaVariablesGalleryProps): JSX.Element {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedAi, setCopiedAi] = useState(false)

  const mediaItems: MediaGalleryItem[] = (() => {
    if (!runtimeData || typeof runtimeData !== 'object') return []
    const obj = runtimeData as Record<string, unknown>
    if (Array.isArray(obj.gallery) && obj.gallery.length > 0) {
      return obj.gallery as MediaGalleryItem[]
    }
    if (Array.isArray(obj.images) && obj.images.length > 0) {
      return obj.images as MediaGalleryItem[]
    }
    return []
  })()

  const variables: Array<{ key: string; value: string; snippet: string }> = (() => {
    if (!runtimeData || typeof runtimeData !== 'object') return []
    const vars: Array<{ key: string; value: string; snippet: string }> = []
    const obj = runtimeData as Record<string, unknown>

    const statementRoot = statementDataRoot(obj)
    const root = variableRootName ?? statementRoot ?? 'EE'
    const add = (k: string, v: unknown): void => {
      if (v === undefined || v === null) return
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        vars.push({ key: `${root}.${k}`, value: String(v), snippet: `#${root}.${k}` })
      }
    }

    add('project', obj.project)
    add('item', obj.item)
    add('code', obj.code)
    add('unit', obj.unit)
    add('description', obj.description)
    add('estimated_cost', obj.estimated_cost)

    if (statementRoot) {
      add('year', obj.year)
      add('zone', obj.zone)
      add('notes', obj.notes)
      add('permit_basis', obj.permit_basis)
      const collection = statementRoot === 'Lead' ? 'materials'
        : statementRoot === 'Seigniorage' ? 'material_groups' : 'recipes'
      const record = statementRoot === 'Lead' ? 'material'
        : statementRoot === 'Seigniorage' ? 'material_group' : 'RateAnalysis'
      const label = statementRoot === 'Lead' ? 'name'
        : statementRoot === 'Seigniorage' ? 'label' : 'code'
      vars.push({
        key: `${root}.${collection}`,
        value: `${Array.isArray(obj[collection]) ? obj[collection].length : 0} records`,
        snippet: `#for ${record} in ${root}.${collection} [\n  #${record}.${label}\n]`
      })
      if (statementRoot === 'Lead') {
        const charts = Array.isArray(obj.charts) ? obj.charts.length : 0
        vars.push({
          key: `${root}.charts`,
          value: charts > 0
            ? `${charts} SOR source chart table(s)`
            : 'SOR source charts (after Sync Lead, for applied variants)',
          snippet: `#for chart in ${root}.charts [\n  #chart.code\n  #chart.title\n]`
        })
      }
      if (statementRoot === 'Lead' && obj.map && typeof obj.map === 'object') {
        const map = obj.map as Record<string, unknown>
        vars.push({
          key: `${root}.map`,
          value: map.available
            ? `Route map ready · ${String(map.path ?? 'images/lead-route-map.png')}`
            : `images/lead-route-map.png · capturing with Open / Recompile`,
          snippet: `#if ${root}.map.available [\n  #pagebreak()\n  #image("images/lead-route-map.png", width: 100%)\n]`
        })
      }
    }

    if (obj.final && typeof obj.final === 'object') {
      const fin = obj.final as Record<string, unknown>
      add('final.qty', fin.qty)
      add('final.rate', fin.rate)
      add('final.amount', fin.amount)
      add('final.unit', fin.unit)
    }

    if (obj.setup && typeof obj.setup === 'object') {
      const setup = obj.setup as Record<string, unknown>
      add('setup.paper', setup.paper)
      add('setup.fontSizePt', setup.fontSizePt)
    }

    return vars
  })()

  const copyText = async (id: string, text: string): Promise<void> => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1800)
  }

  const copyForAiPrompt = async (): Promise<void> => {
    const prompt = buildAiPrompt({
      runtimeData,
      documentSettings: documentSettings ?? DEFAULT_DOCUMENT_SETTINGS,
      typstSource
    })

    await navigator.clipboard.writeText(prompt)
    setCopiedAi(true)
    setTimeout(() => setCopiedAi(false), 2200)
  }

  return (
    <div className="media-variables-gallery">
      {/* Top Banner with AI Helper */}
      <div className="gallery-header">
        <div className="gallery-header-title">
          <Layers size={16} />
          <div>
            <h3>Media & Variables Gallery</h3>
            <p>
              In-memory images, charts, and document variables available to your Typst template.
            </p>
          </div>
        </div>
        <div className="gallery-header-actions">
          <button
            className={`btn-ai-prompt ${copiedAi ? 'copied' : ''}`}
            onClick={() => void copyForAiPrompt()}
            title="Copy formatted markdown prompt of all variables and images for ChatGPT / Claude / DeepMind"
          >
            {copiedAi ? <Check size={14} /> : <Sparkles size={14} />}
            {copiedAi ? 'Copied Prompt for AI!' : 'Copy for AI Prompt'}
          </button>
          {onClose && (
            <button className="btn-close-gallery" onClick={onClose} title="Back to Code">
              Back to Code
            </button>
          )}
        </div>
      </div>

      <div className="gallery-content">
        {/* Section 1: In-Memory Images & Charts */}
        <div className="gallery-section">
          <div className="gallery-section-title">
            <ImageIcon size={15} />
            <span>Images & Charts ({mediaItems.length})</span>
            <span className="gallery-section-badge">Zero Disk I/O (Virtual Shadow Files)</span>
          </div>

          {mediaItems.length === 0 ? (
            <div className="gallery-empty-card">
              <ImageIcon size={28} />
              <h4>No images or charts attached</h4>
              <p>
                Charts created in the spreadsheet or images pasted into cells appear here automatically as virtual in-memory paths (e.g. <code>images/chart_1.png</code>).
              </p>
            </div>
          ) : (
            <div className="gallery-cards-grid">
              {mediaItems.map((item) => {
                const directUsage = `#image("${item.path}", width: 80%)`
                const placedUsage =
                  item.typstSnippet ||
                  `#place(top + left, dx: ${((item.relLeftPx ?? item.left ?? 0) * 0.75).toFixed(0)}pt, dy: ${((item.relTopPx ?? item.top ?? 0) * 0.75).toFixed(0)}pt, image("${item.path}", width: ${(item.width * 0.75).toFixed(0)}pt))`

                return (
                  <div key={item.id} className="media-card">
                    <div className="media-card-preview">
                      {item.previewUrl ? (
                        <img src={item.previewUrl} alt={item.name} />
                      ) : (
                        <div className="media-no-preview">
                          <ImageIcon size={24} />
                          {item.id === 'lead-route-map' && (
                            <span>Captures on Open / Recompile</span>
                          )}
                        </div>
                      )}
                      <span className={`media-type-tag ${item.type}`}>
                        {item.type.toUpperCase()}
                      </span>
                    </div>

                    <div className="media-card-info">
                      <div className="media-card-title">{item.name}</div>
                      <div className="media-card-path">
                        <code>{item.path}</code>
                        <span>{item.width}×{item.height}px</span>
                      </div>

                      <div className="media-card-actions">
                        <button
                          className="btn-card-action"
                          onClick={() => onInsertCode?.(`\n${directUsage}\n`)}
                          title="Insert #image() into Code"
                        >
                          <Plus size={12} /> Insert #image
                        </button>
                        <button
                          className="btn-card-action secondary"
                          onClick={() => onInsertCode?.(`\n${placedUsage}\n`)}
                          title="Insert absolute #place() into Code"
                        >
                          <FileCode size={12} /> Insert #place
                        </button>
                        <button
                          className={`btn-card-action icon ${copiedId === item.id ? 'copied' : ''}`}
                          onClick={() => void copyText(item.id, directUsage)}
                          title="Copy Typst snippet"
                        >
                          {copiedId === item.id ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Section 2: Runtime Variables */}
        <div className="gallery-section">
          <div className="gallery-section-title">
            <Variable size={15} />
            <span>Document Runtime Variables ({variables.length})</span>
            <span className="gallery-section-badge">Live sys.inputs["ee-data"]</span>
          </div>

          <div className="variables-table-container">
            <table className="variables-table">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Current Value</th>
                  <th>Typst Expression</th>
                  <th style={{ width: '90px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {variables.map((v) => (
                  <tr key={v.key}>
                    <td>
                      <code className="var-key">{v.key}</code>
                    </td>
                    <td>
                      <span className="var-val">{v.value}</span>
                    </td>
                    <td>
                      <code className="var-snippet">{v.snippet}</code>
                    </td>
                    <td>
                      <div className="var-actions">
                        <button
                          className="btn-var-insert"
                          onClick={() => onInsertCode?.(v.snippet)}
                          title={`Insert ${v.snippet} into Code`}
                        >
                          <Plus size={11} /> Insert
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
