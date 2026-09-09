import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Code2,
  Copy,
  Download,
  FileText,
  Maximize2,
  Minimize2,
  Printer,
  RotateCcw,
  Sliders,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import PdfPageStack from '../print/PdfPageStack'
import './typstStudio.css'

export interface TypstVisualOptions {
  title?: string
  subtitle?: string
  officeName?: string
  pageSize?: 'a4' | 'a3' | 'letter' | 'legal'
  orientation?: 'portrait' | 'landscape'
  monochrome?: boolean
  marginMm?: number
  customNotes?: string
  preparedBy?: string
  checkedBy?: string
  verifiedBy?: string
  executiveEngineer?: string
}

export interface TypstStudioModalProps {
  title: string
  subtitle?: string
  defaultTypstSource: string
  generateTypstFromOptions?: (options: TypstVisualOptions) => string
  initialOptions?: TypstVisualOptions
  onClose: () => void
}

export default function TypstStudioModal({
  title,
  subtitle = 'Typst Live Layout Studio & Preview',
  defaultTypstSource,
  generateTypstFromOptions,
  initialOptions = {},
  onClose
}: TypstStudioModalProps): JSX.Element {
  const [tab, setTab] = useState<'visual' | 'code'>('visual')
  const [visualOptions, setVisualOptions] = useState<TypstVisualOptions>({
    pageSize: 'a4',
    orientation: 'portrait',
    marginMm: 14,
    monochrome: false,
    ...initialOptions
  })
  const [code, setCode] = useState<string>(defaultTypstSource)
  const [compiledPdfUrl, setCompiledPdfUrl] = useState<string | null>(null)
  const [compileLoading, setCompileLoading] = useState(false)
  const [compileError, setCompileError] = useState<string | null>(null)
  const [compileTimeMs, setCompileTimeMs] = useState<number | null>(null)
  const [zoom, setZoom] = useState(100)
  const [copied, setCopied] = useState(false)
  const printFrameRef = useRef<HTMLIFrameElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Track if user explicitly edited the raw code
  const [isRawCodeDirty, setIsRawCodeDirty] = useState(false)

  // When visual options change, regenerate code if not dirty
  useEffect(() => {
    if (generateTypstFromOptions && !isRawCodeDirty) {
      const regenerated = generateTypstFromOptions(visualOptions)
      setCode(regenerated)
    }
  }, [visualOptions, generateTypstFromOptions, isRawCodeDirty])

  // Debounced compilation
  useEffect(() => {
    let active = true
    const timer = setTimeout(async () => {
      if (!code.trim()) return
      setCompileLoading(true)
      setCompileError(null)
      const start = performance.now()
      try {
        const res = await window.api.typst.compile(code)
        if (!active) return
        if (!res.ok || !res.data) {
          throw new Error(res.error || 'Failed to compile Typst document')
        }
        const duration = Math.round(performance.now() - start)
        setCompileTimeMs(duration)

        const binary = atob(res.data)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const blob = new Blob([bytes], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)

        setCompiledPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
      } catch (err) {
        if (!active) return
        setCompileError(err instanceof Error ? err.message : String(err))
      } finally {
        if (active) setCompileLoading(false)
      }
    }, 250)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [code])

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (compiledPdfUrl) URL.revokeObjectURL(compiledPdfUrl)
    }
  }, [compiledPdfUrl])

  // Reset to original generated default
  const handleReset = (): void => {
    const freshOptions: TypstVisualOptions = {
      pageSize: 'a4',
      orientation: 'portrait',
      marginMm: 14,
      monochrome: false,
      ...initialOptions
    }
    setVisualOptions(freshOptions)
    setIsRawCodeDirty(false)
    if (generateTypstFromOptions) {
      setCode(generateTypstFromOptions(freshOptions))
    } else {
      setCode(defaultTypstSource)
    }
  }

  // Copy code to clipboard
  const handleCopyCode = async (): Promise<void> => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Download .typ file
  const handleDownloadTyp = (): void => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.toLowerCase().replace(/\s+/g, '_')}.typ`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Direct print
  const handlePrint = (): void => {
    if (!compiledPdfUrl) return
    if (printFrameRef.current) {
      printFrameRef.current.contentWindow?.print()
    } else {
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = compiledPdfUrl
      document.body.appendChild(iframe)
      iframe.onload = () => iframe.contentWindow?.print()
    }
  }

  // Line numbers calculation
  const lineCount = useMemo(() => code.split('\n').length, [code])
  const lineNumbers = useMemo(() => {
    return Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')
  }, [lineCount])

  // Handle Tab key in code editor
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newCode = code.substring(0, start) + '  ' + code.substring(end)
      setCode(newCode)
      setIsRawCodeDirty(true)
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2
      }, 0)
    }
  }

  const insertSnippet = (snippet: string): void => {
    if (!textareaRef.current) return
    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newCode = code.substring(0, start) + snippet + code.substring(end)
    setCode(newCode)
    setIsRawCodeDirty(true)
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + snippet.length
      textarea.focus()
    }, 0)
  }

  return (
    <div className="typst-studio-backdrop" role="dialog" aria-modal="true">
      <div className="typst-studio-modal">
        {/* Header Toolbar */}
        <div className="typst-studio-header">
          <div className="typst-studio-title-area">
            <span className="typst-studio-title-badge">
              <FileText size={16} /> {title}
            </span>
            {compileLoading ? (
              <span className="typst-studio-compile-badge">Compiling…</span>
            ) : compileError ? (
              <span className="typst-studio-compile-badge error">Syntax Error</span>
            ) : compileTimeMs !== null ? (
              <span className="typst-studio-compile-badge">Compiled in {compileTimeMs}ms</span>
            ) : null}
          </div>

          <div className="typst-studio-tabs">
            <button
              className={`typst-studio-tab-btn ${tab === 'visual' ? 'active' : ''}`}
              onClick={() => setTab('visual')}
            >
              <Sliders size={14} /> Visual Layout
            </button>
            <button
              className={`typst-studio-tab-btn ${tab === 'code' ? 'active' : ''}`}
              onClick={() => setTab('code')}
            >
              <Code2 size={14} /> Typst Code {isRawCodeDirty && '•'}
            </button>
          </div>

          <div className="typst-studio-actions">
            <button
              className="btn ghost"
              onClick={handleReset}
              title="Reset layout and values to software calculation defaults"
            >
              <RotateCcw size={14} /> Reset
            </button>
            <button
              className="btn ghost"
              onClick={() => void handleCopyCode()}
              title="Copy .typ source markup"
            >
              <Copy size={14} /> {copied ? 'Copied!' : 'Copy .typ'}
            </button>
            <button
              className="btn ghost"
              onClick={handleDownloadTyp}
              title="Download standalone .typ file"
            >
              <Download size={14} /> Download .typ
            </button>
            <button
              className="btn"
              disabled={!compiledPdfUrl || compileLoading}
              onClick={handlePrint}
            >
              <Printer size={14} /> Print
            </button>
            <button className="btn ghost" onClick={onClose} title="Close Studio">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body Split View */}
        <div className="typst-studio-body">
          {/* Left Pane: Visual Settings OR Code Editor */}
          <div className="typst-studio-left-pane">
            {tab === 'visual' ? (
              <div className="typst-visual-settings">
                {/* Document Titles */}
                <div className="typst-settings-section">
                  <div className="typst-settings-title">Document Headings & Office</div>
                  <div className="typst-form-group">
                    <label>Office / Department Name</label>
                    <input
                      type="text"
                      className="typst-form-input"
                      placeholder="e.g. Minor Irrigation Division, Tumakuru"
                      value={visualOptions.officeName || ''}
                      onChange={(e) => setVisualOptions((prev) => ({ ...prev, officeName: e.target.value }))}
                    />
                  </div>
                  <div className="typst-form-group">
                    <label>Project Work Name / Title</label>
                    <input
                      type="text"
                      className="typst-form-input"
                      value={visualOptions.title || ''}
                      onChange={(e) => setVisualOptions((prev) => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div className="typst-form-group">
                    <label>Subtitle / Reference Number</label>
                    <input
                      type="text"
                      className="typst-form-input"
                      placeholder="e.g. Technical Sanction No. 42/2025-26"
                      value={visualOptions.subtitle || ''}
                      onChange={(e) => setVisualOptions((prev) => ({ ...prev, subtitle: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Page Setup */}
                <div className="typst-settings-section">
                  <div className="typst-settings-title">Page Setup & Theme</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div className="typst-form-group">
                      <label>Paper Size</label>
                      <select
                        className="typst-form-select"
                        value={visualOptions.pageSize || 'a4'}
                        onChange={(e) => setVisualOptions((prev) => ({ ...prev, pageSize: e.target.value as any }))}
                      >
                        <option value="a4">A4 Standard (210 × 297 mm)</option>
                        <option value="a3">A3 Wide (297 × 420 mm)</option>
                        <option value="legal">Legal (8.5 × 14 in)</option>
                        <option value="letter">Letter (8.5 × 11 in)</option>
                      </select>
                    </div>

                    <div className="typst-form-group">
                      <label>Orientation</label>
                      <select
                        className="typst-form-select"
                        value={visualOptions.orientation || 'portrait'}
                        onChange={(e) => setVisualOptions((prev) => ({ ...prev, orientation: e.target.value as any }))}
                      >
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                    <div className="typst-form-group">
                      <label>Margins</label>
                      <select
                        className="typst-form-select"
                        value={visualOptions.marginMm ?? 14}
                        onChange={(e) => setVisualOptions((prev) => ({ ...prev, marginMm: Number(e.target.value) }))}
                      >
                        <option value={10}>Compact (10 mm)</option>
                        <option value={14}>Standard (14 mm)</option>
                        <option value={20}>Wide (20 mm)</option>
                      </select>
                    </div>

                    <div className="typst-form-group">
                      <label>Print Color Scheme</label>
                      <select
                        className="typst-form-select"
                        value={visualOptions.monochrome ? 'mono' : 'color'}
                        onChange={(e) => setVisualOptions((prev) => ({ ...prev, monochrome: e.target.value === 'mono' }))}
                      >
                        <option value="color">Modern UI (Navy & Teal)</option>
                        <option value="mono">Monochrome (High-Contrast B&W)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Notes & Special Clauses */}
                <div className="typst-settings-section">
                  <div className="typst-settings-title">Notes, Remarks & Clauses</div>
                  <div className="typst-form-group">
                    <label>Official Notes / Certificate Remarks</label>
                    <textarea
                      className="typst-form-textarea"
                      placeholder="Add official notes, certificate clauses, or lead distance verification remarks here…"
                      value={visualOptions.customNotes || ''}
                      onChange={(e) => setVisualOptions((prev) => ({ ...prev, customNotes: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Signatures */}
                <div className="typst-settings-section">
                  <div className="typst-settings-title">Signatures & Approvals</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div className="typst-form-group">
                      <label>Prepared By</label>
                      <input
                        type="text"
                        className="typst-form-input"
                        placeholder="Assistant Engineer"
                        value={visualOptions.preparedBy || ''}
                        onChange={(e) => setVisualOptions((prev) => ({ ...prev, preparedBy: e.target.value }))}
                      />
                    </div>
                    <div className="typst-form-group">
                      <label>Checked By</label>
                      <input
                        type="text"
                        className="typst-form-input"
                        placeholder="Assistant Executive Engineer"
                        value={visualOptions.checkedBy || ''}
                        onChange={(e) => setVisualOptions((prev) => ({ ...prev, checkedBy: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                    <div className="typst-form-group">
                      <label>Verified By</label>
                      <input
                        type="text"
                        className="typst-form-input"
                        placeholder="Technical Assistant"
                        value={visualOptions.verifiedBy || ''}
                        onChange={(e) => setVisualOptions((prev) => ({ ...prev, verifiedBy: e.target.value }))}
                      />
                    </div>
                    <div className="typst-form-group">
                      <label>Executive Engineer</label>
                      <input
                        type="text"
                        className="typst-form-input"
                        placeholder="Executive Engineer"
                        value={visualOptions.executiveEngineer || ''}
                        onChange={(e) => setVisualOptions((prev) => ({ ...prev, executiveEngineer: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="typst-code-pane">
                {/* Code Toolbar */}
                <div className="typst-code-toolbar">
                  <span>Typst Source (.typ)</span>
                  <div className="typst-code-snippets">
                    <button
                      className="typst-snippet-btn"
                      onClick={() => insertSnippet('\n#pagebreak()\n')}
                      title="Insert page break"
                    >
                      + Page Break
                    </button>
                    <button
                      className="typst-snippet-btn"
                      onClick={() => insertSnippet('\n#v(12pt)\n')}
                      title="Insert vertical space"
                    >
                      + Space
                    </button>
                    <button
                      className="typst-snippet-btn"
                      onClick={() => insertSnippet('\n#text(10pt, weight: "bold")[Custom Heading]\n')}
                      title="Insert heading"
                    >
                      + Heading
                    </button>
                  </div>
                </div>

                {/* Code Editor with Line Numbers */}
                <div className="typst-code-editor-wrapper">
                  <div className="typst-code-line-numbers">{lineNumbers}</div>
                  <textarea
                    ref={textareaRef}
                    className="typst-code-textarea"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value)
                      setIsRawCodeDirty(true)
                    }}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Pane: Live PDF Vector Preview */}
          <div className="typst-studio-right-pane">
            <div className="typst-preview-toolbar">
              <span style={{ fontSize: '0.8rem', color: '#828997' }}>
                Live Vector Preview ({subtitle})
              </span>
              <div className="typst-zoom-controls">
                <button className="btn-mini ghost" onClick={() => setZoom((z) => Math.max(50, z - 15))}>
                  <ZoomOut size={13} />
                </button>
                <span style={{ fontSize: '0.75rem', minWidth: '40px', textAlign: 'center' }}>{zoom}%</span>
                <button className="btn-mini ghost" onClick={() => setZoom((z) => Math.min(200, z + 15))}>
                  <ZoomIn size={13} />
                </button>
                <button className="btn-mini ghost" onClick={() => setZoom(100)}>
                  100%
                </button>
              </div>
            </div>

            {compileError && (
              <div className="typst-error-banner">
                <b>Compilation Error:</b> {compileError}
              </div>
            )}

            <div className="typst-preview-scroll-area">
              {compiledPdfUrl && (
                <PdfPageStack src={compiledPdfUrl} zoom={zoom} />
              )}
            </div>
          </div>
        </div>

        {/* Hidden printing iframe */}
        {compiledPdfUrl && (
          <iframe
            ref={printFrameRef}
            src={compiledPdfUrl}
            style={{ display: 'none' }}
            title="Typst Studio Print Output"
          />
        )}
      </div>
    </div>
  )
}

