import { useEffect, useState } from 'react'
import type { Margins, Orientation, PaperSize } from '../../types/project'
import {
  DOCUMENT_MARGIN_PRESETS,
  FONT_CATALOG,
  clampDocumentFontSize,
  type DocumentFontFamily,
  type DocumentSettings
} from '../../lib/typist-output/documentSettings'

interface Props {
  settings: DocumentSettings
  inherited?: boolean
  onChange: (settings: DocumentSettings) => void
  onUseProjectDefaults?: () => void
}

function marginsEqual(a: Margins, b: Margins): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left
}

export default function DocumentSettingsPanel({
  settings,
  inherited = false,
  onChange,
  onUseProjectDefaults
}: Props): JSX.Element {
  const [fontSizeDraft, setFontSizeDraft] = useState(String(settings.fontSizePt))

  useEffect(() => {
    setFontSizeDraft(String(settings.fontSizePt))
  }, [settings.fontSizePt])

  const update = <K extends keyof DocumentSettings>(key: K, value: DocumentSettings[K]): void => {
    onChange({ ...settings, [key]: value })
  }
  const updateMargin = (side: keyof Margins, value: number): void => {
    const safeValue = Math.max(0, Math.min(60, Number.isFinite(value) ? value : 0))
    update('margins', { ...settings.margins, [side]: safeValue })
  }
  const activePreset = Object.entries(DOCUMENT_MARGIN_PRESETS).find(([, margins]) =>
    marginsEqual(margins, settings.margins)
  )?.[0]
  const updateFontSizeDraft = (value: string): void => {
    setFontSizeDraft(value)
    const parsed = Number(value)
    if (value.trim() && Number.isFinite(parsed) && parsed >= 6 && parsed <= 18) {
      update('fontSizePt', parsed)
    }
  }
  const commitFontSize = (): void => {
    const parsed = Number(fontSizeDraft)
    const next = fontSizeDraft.trim() && Number.isFinite(parsed)
      ? clampDocumentFontSize(parsed)
      : settings.fontSizePt
    setFontSizeDraft(String(next))
    if (next !== settings.fontSizePt) update('fontSizePt', next)
  }

  return (
    <div className="document-settings-panel">
      <div className="document-settings-intro">
        <div>
          <strong>Document Settings</strong>
          <span>{inherited ? 'Using whole-project defaults' : 'Custom settings for this document only'}</span>
        </div>
        {onUseProjectDefaults && !inherited && (
          <button className="btn ghost" onClick={onUseProjectDefaults}>Use project defaults</button>
        )}
      </div>

      <section className="document-settings-section">
        <h3>Page setup</h3>
        <div className="document-settings-row two">
          <label>
            <span>Paper size</span>
            <select value={settings.pageSize} onChange={(event) => update('pageSize', event.target.value as PaperSize)}>
              {(['A4', 'A3', 'A2', 'Letter', 'Legal'] as PaperSize[]).map((size) => <option key={size}>{size}</option>)}
            </select>
          </label>
          <label>
            <span>Orientation</span>
            <select value={settings.orientation} onChange={(event) => update('orientation', event.target.value as Orientation)}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
        </div>
      </section>

      <section className="document-settings-section">
        <h3>Margins</h3>
        <div className="document-margin-presets">
          {Object.entries(DOCUMENT_MARGIN_PRESETS).map(([name, margins]) => (
            <button key={name} className={activePreset === name ? 'active' : ''} onClick={() => update('margins', { ...margins })}>{name}</button>
          ))}
          <span className={!activePreset ? 'active' : ''}>Custom</span>
        </div>
        <div className={`document-margin-gui ${settings.orientation}`}>
          <label className="margin-top"><span>Top</span><input type="number" min="0" max="60" value={settings.margins.top} onChange={(event) => updateMargin('top', Number(event.target.value))} /><em>mm</em></label>
          <label className="margin-right"><span>Right</span><input type="number" min="0" max="60" value={settings.margins.right} onChange={(event) => updateMargin('right', Number(event.target.value))} /><em>mm</em></label>
          <div className="document-page-mini" aria-label="Margin preview">
            <div style={{ top: `${Math.min(35, settings.margins.top)}%`, right: `${Math.min(35, settings.margins.right)}%`, bottom: `${Math.min(35, settings.margins.bottom)}%`, left: `${Math.min(35, settings.margins.left)}%` }} />
          </div>
          <label className="margin-bottom"><span>Bottom</span><input type="number" min="0" max="60" value={settings.margins.bottom} onChange={(event) => updateMargin('bottom', Number(event.target.value))} /><em>mm</em></label>
          <label className="margin-left"><span>Left</span><input type="number" min="0" max="60" value={settings.margins.left} onChange={(event) => updateMargin('left', Number(event.target.value))} /><em>mm</em></label>
        </div>
      </section>

      <section className="document-settings-section">
        <h3>Typography</h3>
        <div className="document-settings-row two">
          <label>
            <span>Font</span>
            <select value={settings.fontFamily} onChange={(event) => update('fontFamily', event.target.value as DocumentFontFamily)}>
              {FONT_CATALOG.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
            </select>
          </label>
          <label>
            <span>Normal text size</span>
            <div className="document-font-size-input">
              <input
                type="number"
                min="6"
                max="18"
                step="0.5"
                value={fontSizeDraft}
                onChange={(event) => updateFontSizeDraft(event.target.value)}
                onBlur={commitFontSize}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
              />
              <em>pt</em>
            </div>
          </label>
        </div>
        <div className="document-type-scale" aria-label="Derived typography sizes">
          <span><b style={{ fontSize: `${Math.min(22, settings.fontSizePt * 1.37)}px` }}>Heading</b><small>{(settings.fontSizePt * 1.37).toFixed(1)} pt</small></span>
          <span><b style={{ fontSize: `${Math.min(19, settings.fontSizePt * 1.11)}px` }}>Subheading</b><small>{(settings.fontSizePt * 1.11).toFixed(1)} pt</small></span>
          <span><b style={{ fontSize: `${Math.min(17, settings.fontSizePt)}px` }}>Normal text</b><small>{settings.fontSizePt.toFixed(1)} pt</small></span>
          <span><b style={{ fontSize: `${Math.min(16, settings.fontSizePt * 0.95)}px` }}>Notes &amp; comments</b><small>{(settings.fontSizePt * 0.95).toFixed(1)} pt</small></span>
        </div>
      </section>
    </div>
  )
}
