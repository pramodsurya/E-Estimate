import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  CornerDownLeft,
  Download,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Minus,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Strikethrough,
  Table as TableIcon,
  Type,
  Underline as UnderlineIcon,
  Upload,
  X,
  Zap,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import PdfPageStack from '../print/PdfPageStack'
import {
  applyDocumentSettingsToTypst,
  normalizeDocumentSettings,
  parseDocumentSettingsFromTypst,
  type DocumentSettings
} from '../../lib/typist-output/documentSettings'
import { buildAiPrompt } from '../../lib/typist-output/aiPromptBuilder'
import { typst_lezer } from 'codemirror-lang-typst/lezer'
import type { Extension } from '@codemirror/state'
import { eeRuntime, visualMarkupExtension } from '../../lib/typstVisual'
import DocumentSettingsPanel from './DocumentSettingsPanel'
import MediaVariablesGallery from './MediaVariablesGallery'
import './eEstimatePrintStudio.css'
import './documentSettings.css'
import { useStore } from '../../store/useStore'
import { preparePrintAudit, auditPrintContent, auditShadowFiles, printIssuesForAi, type PrintIssue } from '../../lib/typist-output/printContentAudit'

export interface EEstimatePrintStudioProps {
  title: string
  subtitle?: string
  defaultTypstSource: string
  savedTypstSource?: string
  scopeKey?: string
  projectDocumentSettings: Partial<DocumentSettings>
  savedDocumentSettings?: Partial<DocumentSettings>
  onSave?: (source: string, settings: DocumentSettings | null) => void | Promise<void>
  onClose: () => void
  /** Persistent page studios can hide the modal close action. */
  closable?: boolean
  /** Runtime `sys.inputs` forwarded to the Typst compiler (e.g. `{ 'ee-data': ... }`). */
  compileInputs?: Record<string, string>
  /** Refresh project data on compile, without replacing the editable source. */
  onSync?: () => Promise<Record<string, string>>
  /** Runtime data for the source-authoritative visual layer (chips + runtime tables). */
  runtimeData?: unknown
  /** App-owned Typst helpers prepended (never saved) before every compile. */
  compilePrelude?: string
  /** Virtual in-memory files (e.g. Base64 images/charts) mapped into Typst's shadow filesystem */
  shadowFiles?: Record<string, string>
  /**
   * When set, preview compiles this request instead of the editor source alone.
   * Project Print Studio uses it for the full book while the editor still edits
   * the General Abstract.
   */
  assembleCompile?: (editorSource: string) => Promise<{
    mainContent: string
    inputs: Record<string, string>
    shadowFiles?: Record<string, string>
  }>
  /** Apply the runtime decoration layer in Visual mode (default true). Layout-only
   *  studios (content edited on the dashboard) can set false to keep Visual as source. */
  visualize?: boolean
  /**
   * When false the studio does NOT inject the app-managed `#set page(...)` block.
   * The template then owns page setup via `EE.setup` (so the AI/layout controls the
   * page). Default true; set false for spreadsheet-item studios.
   */
  managePageSetup?: boolean
  /** Shown above the preview when the document needs an action outside this studio. */
  notice?: string
}

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', hex: '#fef08a' },
  { name: 'Cyan', hex: '#a5f3fc' },
  { name: 'Green', hex: '#bbf7d0' },
  { name: 'Pink', hex: '#fbcfe8' },
  { name: 'Orange', hex: '#fed7aa' }
]

const TEXT_COLORS = [
  { name: 'Navy Blue', hex: '#0b3d5c' },
  { name: 'Teal', hex: '#087e8b' },
  { name: 'Dark Gray', hex: '#334155' },
  { name: 'Crimson Red', hex: '#dc2626' },
  { name: 'Forest Green', hex: '#16a34a' }
]

const FONT_SIZES = ['8', '9', '9.5', '10', '11', '12', '14', '16', '18']

/** Book compiles can be large; never leave the preview on “Compiling…” forever. */
const COMPILE_TIMEOUT_MS = 90_000

/**
 * High-contrast dark theme for Typst source. The default One Dark palette has
 * several red/blue tokens that become difficult to distinguish on some
 * displays, especially at lower brightness. Every text colour below clears
 * WCAG AA contrast against the editor background.
 */
const eEstimateCodeTheme: Extension = [
  EditorView.theme({
    '&': {
      color: '#e6edf3',
      backgroundColor: '#171b22'
    },
    '.cm-content': { caretColor: '#ffffff' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#ffffff' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#355b85'
    },
    '.cm-activeLine': { backgroundColor: '#252d38' },
    '.cm-selectionMatch': { backgroundColor: '#3d5f46' },
    '.cm-searchMatch': {
      backgroundColor: '#8a6400',
      outline: '1px solid #ffd166'
    },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#a87600' },
    '&.cm-focused .cm-matchingBracket': {
      backgroundColor: '#365f4c',
      outline: '1px solid #7ee787'
    },
    '&.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: '#702f35',
      outline: '1px solid #ff9b9b'
    },
    '.cm-gutters': {
      backgroundColor: '#171b22',
      color: '#aab4c3',
      borderRight: '1px solid #343d4a'
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#2b3441',
      color: '#ffffff'
    },
    '.cm-foldPlaceholder': { color: '#e6edf3', borderColor: '#667085' },
    '.cm-panels, .cm-tooltip': {
      color: '#f0f3f6',
      backgroundColor: '#252b35'
    },
    '.cm-tooltip': { border: '1px solid #596579' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      color: '#ffffff',
      backgroundColor: '#355b85'
    }
  }, { dark: true }),
  syntaxHighlighting(HighlightStyle.define([
    { tag: [tags.meta, tags.comment], color: '#b8c0cc', fontStyle: 'italic' },
    { tag: tags.keyword, color: '#d2a8ff' },
    { tag: [tags.processingInstruction, tags.string, tags.inserted], color: '#a5e075' },
    { tag: [tags.number, tags.bool, tags.atom], color: '#79c0ff' },
    { tag: [tags.typeName, tags.className, tags.annotation], color: '#ffb86b' },
    { tag: [tags.function(tags.variableName), tags.labelName], color: '#80d4ff' },
    { tag: [tags.definition(tags.name), tags.variableName], color: '#e6edf3' },
    { tag: [tags.propertyName, tags.attributeName, tags.macroName], color: '#ffa7b0' },
    { tag: [tags.operator, tags.operatorKeyword, tags.punctuation, tags.separator], color: '#d7dee8' },
    { tag: [tags.url, tags.link, tags.escape, tags.regexp], color: '#7ee7d1' },
    { tag: [tags.constant(tags.name), tags.standard(tags.name), tags.self, tags.namespace], color: '#ffd580' },
    { tag: tags.heading, color: '#ffa7b0', fontWeight: 'bold' },
    { tag: tags.strong, color: '#ffffff', fontWeight: 'bold' },
    { tag: tags.emphasis, color: '#ffffff', fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: [tags.deleted, tags.invalid], color: '#ffffff', backgroundColor: '#8b2635' }
  ]))
]

function studioContextLabel(scopeKey: string | undefined, title: string, subtitle: string): string {
  if (scopeKey === 'general-abstract') return 'Project'
  if (scopeKey === 'lead-statement') return 'Lead'
  if (scopeKey === 'seigniorage-statement') return 'Seigniorage'
  if (scopeKey === 'data-dashboard') return 'DATA'
  if (scopeKey === 'front-cover' || scopeKey?.startsWith('component-') || scopeKey?.startsWith('item-sheet-')) {
    return subtitle || title
  }
  return title
    .replace(/\s*[—–-]\s*(?:Typst\s+)?Print Studio.*$/i, '')
    .replace(/\s+(?:Code\s*&\s*Layout\s+)?Studio$/i, '')
    .trim()
}

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `${label} timed out after ${Math.round(ms / 1000)}s. The Typst engine may still be running — try Recompile.`
        )
      )
    }, ms)
    work.then(
      (value) => {
        if (timer) clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        if (timer) clearTimeout(timer)
        reject(err)
      }
    )
  })
}

export default function EEstimatePrintStudio({
  title,
  subtitle = 'Code & Document Layout Studio',
  defaultTypstSource,
  savedTypstSource,
  scopeKey,
  projectDocumentSettings,
  savedDocumentSettings,
  onSave,
  onClose,
  closable = true,
  compileInputs,
  onSync,
  runtimeData,
  compilePrelude,
  shadowFiles,
  assembleCompile,
  visualize = true,
  managePageSetup = true,
  notice
}: EEstimatePrintStudioProps): JSX.Element {
  const initialDocumentSettings = normalizeDocumentSettings(
    savedDocumentSettings ?? projectDocumentSettings,
    projectDocumentSettings
  )
  const initialSource = savedTypstSource ?? (managePageSetup
    ? applyDocumentSettingsToTypst(defaultTypstSource, initialDocumentSettings)
    : defaultTypstSource)
  const [code, setCode] = useState<string>(initialSource)
  const [editorMode, setEditorMode] = useState<'code' | 'document' | 'gallery'>('code')
  const [documentSettings, setDocumentSettings] = useState(initialDocumentSettings)
  const [usesProjectDocumentSettings, setUsesProjectDocumentSettings] = useState(!savedDocumentSettings)
  const [compiledPdfUrl, setCompiledPdfUrl] = useState<string | null>(null)
  const [compiledPdfBase64, setCompiledPdfBase64] = useState<string | null>(null)
  const [compileLoading, setCompileLoading] = useState(false)
  const [compileError, setCompileError] = useState<string | null>(null)
  const [compileTimeMs, setCompileTimeMs] = useState<number | null>(null)
  const [lastCompiledSource, setLastCompiledSource] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [copiedAi, setCopiedAi] = useState(false)
  const [lastSavedSource, setLastSavedSource] = useState(savedTypstSource)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [issues, setIssues] = useState<PrintIssue[]>([])
  const [issuesOpen, setIssuesOpen] = useState(false)
  const [lastSavedSettingsKey, setLastSavedSettingsKey] = useState(
    savedDocumentSettings ? JSON.stringify(savedDocumentSettings) : 'project-defaults'
  )
  const [saving, setSaving] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  const mediaCount = useMemo(() => {
    if (!runtimeData || typeof runtimeData !== 'object') return 0
    const obj = runtimeData as Record<string, unknown>
    if (Array.isArray(obj.gallery)) return obj.gallery.length
    if (Array.isArray(obj.images)) return obj.images.length
    return 0
  }, [runtimeData])

  // Dropdown states
  const [highlightMenuOpen, setHighlightMenuOpen] = useState(false)
  const [textColorMenuOpen, setTextColorMenuOpen] = useState(false)
  const [fontSizeMenuOpen, setFontSizeMenuOpen] = useState(false)
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false)
  const [tableMenuOpen, setTableMenuOpen] = useState(false)

  // Find & Replace state
  const [findBarOpen, setFindBarOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')

  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const uploadTypRef = useRef<HTMLInputElement>(null)
  const printFrameRef = useRef<HTMLIFrameElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const initialCompileStartedRef = useRef(false)
  const loadedInputsRef = useRef(compileInputs)
  const inputsReadyRef = useRef(!onSync)
  const compileGenerationRef = useRef(0)
  const inputKey = JSON.stringify(compileInputs ?? {})
  const previousInputKey = useRef(inputKey)
  useEffect(() => {
    if (previousInputKey.current === inputKey) return
    previousInputKey.current = inputKey
    if (!onSync) {
      compileGenerationRef.current += 1
      setCompileLoading(false)
    }
    setLastCompiledSource(null)
    setIssues([])
  }, [inputKey])

  // Compiler function
  const runCompile = async (sourceToCompile = code, refreshData = true): Promise<void> => {
    const generation = ++compileGenerationRef.current
    if (!sourceToCompile.trim()) {
      setCompileError('The saved template is empty. Add Typst code or choose Use default.')
      setCompileLoading(false)
      setLastCompiledSource(null)
      setIssues([])
      return
    }
    setCompileLoading(true)
    setCompileError(null)
    setIssues([])
    const start = performance.now()
    try {
      const work = (async () => {
        if (refreshData && onSync) {
          loadedInputsRef.current = await onSync()
          inputsReadyRef.current = true
        }
        if (!inputsReadyRef.current) {
          throw new Error('Project values could not be refreshed. Close and reopen Print Studio to try again.')
        }
        let res: Awaited<ReturnType<typeof window.api.typst.compile>>
        let audit: ReturnType<typeof preparePrintAudit>
        if (assembleCompile) {
          const assembled = await assembleCompile(sourceToCompile)
          audit = preparePrintAudit(assembled.inputs)
          if (generation !== compileGenerationRef.current) return null
          res = await window.api.typst.compile(
            assembled.mainContent,
            audit.inputs,
            auditShadowFiles(audit.inputs, assembled.shadowFiles)
          )
        } else {
          const inputs = onSync ? loadedInputsRef.current : compileInputs
          audit = preparePrintAudit(inputs)
          res = await window.api.typst.compile(
            (compilePrelude ?? '') + sourceToCompile,
            audit.inputs,
            shadowFiles
          )
        }
        if (!res.ok || !res.data) {
          throw new Error(res.error || 'Failed to compile Typst document')
        }
        if (generation === compileGenerationRef.current) setIssues(auditPrintContent(audit.obligations, res.printedContent))
        return res
      })()
      const res = await withTimeout(work, COMPILE_TIMEOUT_MS, 'Typst compile')
      if (generation !== compileGenerationRef.current || !res?.data) return
      const duration = Math.round(performance.now() - start)
      setCompileTimeMs(duration)
      setLastCompiledSource(sourceToCompile)
      setCompiledPdfBase64(res.data)

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
      if (generation !== compileGenerationRef.current) return
      setCompileError(err instanceof Error ? err.message : String(err))
    } finally {
      if (generation === compileGenerationRef.current) setCompileLoading(false)
    }
  }

  // Initialize the project's template without marking it saved on disk; compile current values.
  useEffect(() => {
    if (initialCompileStartedRef.current) return
    initialCompileStartedRef.current = true
    if (scopeKey && useStore.getState().project?.printStudioDocuments?.[scopeKey] === undefined) {
      useStore.getState().updatePrintStudioDocument(scopeKey, initialSource, savedDocumentSettings ?? null)
    }
    void runCompile(initialSource, true)
  }, [])

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (compiledPdfUrl) URL.revokeObjectURL(compiledPdfUrl)
    }
  }, [compiledPdfUrl])

  // Close menus when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (!target.closest('.typst-tool-dropdown')) {
        setHighlightMenuOpen(false)
        setTextColorMenuOpen(false)
        setFontSizeMenuOpen(false)
        setHeadingMenuOpen(false)
        setTableMenuOpen(false)
      }
    }
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  // Helper to wrap selected text in CodeMirror
  const wrapSelection = (prefix: string, suffix: string, placeholder = 'text'): void => {
    const view = editorRef.current?.view
    if (!view) return

    const { from, to } = view.state.selection.main
    const selected = view.state.sliceDoc(from, to) || placeholder
    const replacement = `${prefix}${selected}${suffix}`

    view.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: from + prefix.length, head: from + prefix.length + selected.length }
    })
    view.focus()
  }

  const insertSnippet = (snippet: string): void => {
    const view = editorRef.current?.view
    if (view) {
      const { from, to } = view.state.selection.main
      view.dispatch({
        changes: { from, to, insert: snippet },
        selection: { anchor: from + snippet.length }
      })
      view.focus()
    } else {
      setCode((prev) => prev + snippet)
    }
    setEditorMode('code')
  }

  // Format Handlers — apply Typst markup to the CodeMirror source in BOTH modes.
  // (Visual mode is the same source-authoritative document, decorated; a toolbar
  // format just wraps the selected source text.)
  const applyBold = (): void => wrapSelection('*', '*', 'bold text')
  const applyItalic = (): void => wrapSelection('_', '_', 'italic text')
  const applyUnderline = (): void => wrapSelection('#underline[', ']', 'underlined text')
  const applyStrike = (): void => wrapSelection('#strike[', ']', 'strikethrough text')
  const applyHighlight = (hex: string): void => {
    wrapSelection(`#highlight(fill: rgb("${hex}"))[`, ']', 'highlighted text')
    setHighlightMenuOpen(false)
  }
  const applyTextColor = (hex: string): void => {
    wrapSelection(`#text(fill: rgb("${hex}"))[`, ']', 'colored text')
    setTextColorMenuOpen(false)
  }
  const applyFontSize = (pt: string): void => {
    wrapSelection(`#text(size: ${pt}pt)[`, ']', 'text')
    setFontSizeMenuOpen(false)
  }
  const applyAlign = (alignment: 'left' | 'center' | 'right'): void => {
    wrapSelection(`#align(${alignment})[`, ']', 'aligned text')
  }
  const applyHeading = (level: number): void => {
    const prefix = '='.repeat(level) + ' '
    wrapSelection(`\n${prefix}`, '\n', `Heading ${level}`)
    setHeadingMenuOpen(false)
  }
  const insertPageBreak = (): void => wrapSelection('\n#pagebreak()\n', '', '')
  const insertHLine = (): void => wrapSelection('\n#line(length: 100%)\n', '', '')

  const insertBoxCard = (): void => {
    wrapSelection(
      '\n#rect(width: 100%, fill: rgb("#f8fafc"), stroke: 0.5pt + luma(180), inset: 8pt, radius: 1pt)[\n  ',
      '\n]\n',
      'Card content here'
    )
  }

  const insertNoteCallout = (): void => {
    wrapSelection(
      '\n#rect(width: 100%, fill: rgb("#edf7f6"), stroke: (left: 3pt + rgb("#087e8b")), inset: 8pt)[\n  #ee-note[#text(weight: "bold", fill: rgb("#087e8b"))[Note:] ',
      ']\n]\n',
      'Enter official note or certificate remarks here'
    )
  }

  const insertCustomTable = (): void => {
    const tableTemplate = `\n#table(
  columns: (30mm, 1fr, 35mm),
  align: (left, left, right),
  fill: (col, row) => if row == 0 { rgb("#007791") } else { none },
  table.header(
    text(fill: white, weight: "bold")[Item],
    text(fill: white, weight: "bold")[Description],
    text(fill: white, weight: "bold")[Amount (Rs)]
  ),
  [1], [Material description], [₹ 1,250.00],
  table.hline(),
  table.cell(colspan: 2, align: right)[*Total:*], [*₹ 1,250.00*]
)\n`
    wrapSelection(tableTemplate, '', '')
    setTableMenuOpen(false)
  }

  const insertTableCellHighlight = (): void => {
    wrapSelection('table.cell(fill: rgb("#f1f5f9"))[', ']', 'cell text')
    setTableMenuOpen(false)
  }

  // Find & Replace functions
  const handleFindNext = (): void => {
    const view = editorRef.current?.view
    if (!findQuery || !view) return

    const docText = view.state.doc.toString()
    const startIndex = view.state.selection.main.to || 0
    let matchIndex = docText.toLowerCase().indexOf(findQuery.toLowerCase(), startIndex)
    if (matchIndex === -1) {
      matchIndex = docText.toLowerCase().indexOf(findQuery.toLowerCase(), 0)
    }

    if (matchIndex >= 0) {
      view.dispatch({
        selection: { anchor: matchIndex, head: matchIndex + findQuery.length },
        scrollIntoView: true
      })
      view.focus()
    }
  }

  const handleReplace = (): void => {
    const view = editorRef.current?.view
    if (!findQuery || !view) return

    const { from, to } = view.state.selection.main
    const selected = view.state.sliceDoc(from, to)
    if (selected.toLowerCase() === findQuery.toLowerCase()) {
      view.dispatch({
        changes: { from, to, insert: replaceQuery }
      })
      handleFindNext()
    } else {
      handleFindNext()
    }
  }

  const handleReplaceAll = (): void => {
    const view = editorRef.current?.view
    if (!findQuery || !view) return

    const docText = view.state.doc.toString()
    const regex = new RegExp(findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    const newCode = docText.replace(regex, replaceQuery)

    view.dispatch({
      changes: { from: 0, to: docText.length, insert: newCode }
    })
  }

  // Replacing the user's source is always an explicit, confirmed action.
  const handleDefaults = (): void => {
    if (!window.confirm(
      'Restore software defaults?\n\nYour current Typst script, including all manual and AI edits, will be completely replaced by the software default template and layout settings. Your project items and calculated values will not be deleted.\n\nAre you sure you want to replace the current script?'
    )) return
    setCompiledPdfUrl(null)
    setCompiledPdfBase64(null)
    setLastCompiledSource(null)
    setCompileError(null)
    setDocumentSettings(normalizeDocumentSettings(projectDocumentSettings))
    setUsesProjectDocumentSettings(true)
    const nextCode = managePageSetup
      ? applyDocumentSettingsToTypst(defaultTypstSource, projectDocumentSettings)
      : defaultTypstSource
    setCode(nextCode)
    void runCompile(nextCode)
  }

  const handleDocumentSettingsChange = (settings: DocumentSettings): void => {
    setDocumentSettings(settings)
    setUsesProjectDocumentSettings(false)
    setCode((source) =>
      managePageSetup ? applyDocumentSettingsToTypst(source, settings) : source
    )
  }

  const useProjectDefaults = (): void => {
    setDocumentSettings(normalizeDocumentSettings(projectDocumentSettings))
    setUsesProjectDocumentSettings(true)
    setCode((source) =>
      managePageSetup
        ? applyDocumentSettingsToTypst(source, projectDocumentSettings)
        : source
    )
  }

  const handleSave = async (): Promise<void> => {
    const settingsKey = usesProjectDocumentSettings
      ? 'project-defaults'
      : JSON.stringify(documentSettings)
    const liveCode = editorRef.current?.view?.state.doc.toString() ?? code
    if (liveCode !== code) setCode(liveCode)
    if (!onSave || saving || (liveCode === lastSavedSource && settingsKey === lastSavedSettingsKey)) return
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(liveCode, usesProjectDocumentSettings ? null : documentSettings)
      setLastSavedSource(liveCode)
      setLastSavedSettingsKey(settingsKey)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  // Copy prompt for AI with live variables, images, and document settings
  const handleCopyAiPrompt = async (): Promise<void> => {
    const liveCode = editorRef.current?.view?.state.doc.toString() ?? code
    const prompt = buildAiPrompt({
      title,
      subtitle,
      runtimeData,
      documentSettings,
      typstSource: liveCode
    })

    await navigator.clipboard.writeText(prompt + '\n\n' + printIssuesForAi(issues))
    setCopiedAi(true)
    setTimeout(() => setCopiedAi(false), 2200)
  }

  const handleUploadTyp = async (file: File | undefined): Promise<void> => {
    if (!file) return
    try {
      const uploaded = await file.text()
      if (!uploaded.trim()) throw new Error('The selected .typ file is empty.')
      const uploadedSettings = parseDocumentSettingsFromTypst(uploaded)
      if (uploadedSettings) {
        setDocumentSettings(uploadedSettings)
        setUsesProjectDocumentSettings(false)
      }
      setCode(uploaded)
      setSaveError(null)
      void runCompile(uploaded)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      if (uploadTypRef.current) uploadTypRef.current.value = ''
    }
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

  const handleDownloadPdf = async (): Promise<void> => {
    if (!compiledPdfBase64 || exportingPdf) return
    const fileName = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'e-estimate'
    setExportingPdf(true)
    setSaveError(null)
    try {
      await window.api.export.pdf(compiledPdfBase64, fileName)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setExportingPdf(false)
    }
  }

  // Code = raw Typst source (syntax highlighting + folding/lint). Visual = the SAME
  // document decorated with runtime chips + semantic #ee-group-table widgets.
  const editorExtensions = useMemo<Extension[]>(() => {
    const extensions: Extension[] = [EditorView.lineWrapping, typst_lezer()]
    if (visualize) {
      extensions.push(eeRuntime.of(runtimeData ?? null), visualMarkupExtension())
    }
    return extensions
  }, [visualize, runtimeData])
  const currentSettingsKey = usesProjectDocumentSettings
    ? 'project-defaults'
    : JSON.stringify(documentSettings)
  const hasUnsavedChanges = code !== lastSavedSource || currentSettingsKey !== lastSavedSettingsKey

  return (
    <div className="typst-studio-backdrop" role="dialog" aria-modal="true">
      <div className="typst-studio-modal">
        {/* Top Header Bar */}
        <div className="typst-studio-header">
          <div className="typst-studio-title-area">
            <div className="eestimate-print-studio-identity">
              <strong>E-Estimate Print Studio</strong>
              <span>{studioContextLabel(scopeKey, title, subtitle)}</span>
            </div>
          </div>

          <div className="typst-studio-actions">
            <button
              className={`btn btn-studio-ai ${copiedAi ? 'copied' : ''}`}
              onClick={() => void handleCopyAiPrompt()}
              title="Copy the complete active Typst source with focused redesign instructions for ChatGPT / Claude / Gemini"
            >
              {copiedAi ? <Check size={14} /> : <Sparkles size={14} />}
              {copiedAi ? 'Copied Prompt for AI!' : 'Copy Prompt for AI'}
            </button>
            <button
              className="btn ghost"
              disabled={!onSave || saving || !hasUnsavedChanges}
              onClick={() => void handleSave()}
              title={!hasUnsavedChanges ? 'All Print Studio changes are saved' : 'Save Print Studio changes to this project'}
            >
              <Save size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              className="btn ghost"
              onClick={handleDefaults}
              disabled={compileLoading || saving}
              title="Replace the current script with the software default after confirmation"
            >
              <RotateCcw size={14} /> Use default
            </button>
            <input
              ref={uploadTypRef}
              type="file"
              accept=".typ,text/plain"
              hidden
              onChange={(event) => void handleUploadTyp(event.target.files?.[0])}
            />
            <button className="btn ghost" type="button" onClick={() => uploadTypRef.current?.click()}>
              <Upload size={14} /> Upload .typ
            </button>
            <button
              className="btn ghost"
              onClick={handleDownloadTyp}
              title="Download standalone .typ file"
            >
              <Download size={14} /> Download .typ
            </button>
            <button
              className="btn ghost"
              type="button"
              disabled={!compiledPdfBase64 || compileLoading || exportingPdf || !!compileError || lastCompiledSource !== code}
              onClick={() => void handleDownloadPdf()}
              title="Download the current compiled PDF"
            >
              <Download size={14} /> {exportingPdf ? 'Saving PDF…' : 'Download PDF'}
            </button>
            {closable && (
              <button className="btn ghost" onClick={onClose} title="Close Studio">
                <X size={15} /> Close
              </button>
            )}
          </div>
        </div>

        {/* Body Split View */}
        <div className="typst-studio-body">
          {/* Left Pane: Overleaf / TeXlyre CodeMirror 6 Visual Editor */}
          <div className="typst-studio-left-pane">
            {/* GUI Formatting Toolbar */}
            <div className="typst-gui-toolbar">
              {/* Text Formatting: Bold, Italic, Underline, Highlight, Strike */}
              <div className="typst-toolbar-group">
                <button className="typst-tool-btn" onClick={applyBold} title="Bold (*text* / Ctrl+B)">
                  <Bold size={14} />
                </button>
                <button className="typst-tool-btn" onClick={applyItalic} title="Italic (_text_ / Ctrl+I)">
                  <Italic size={14} />
                </button>
                <button className="typst-tool-btn" onClick={applyUnderline} title="Underline (#underline[...] / Ctrl+U)">
                  <UnderlineIcon size={14} />
                </button>
                <button className="typst-tool-btn" onClick={applyStrike} title="Strikethrough (#strike[...])">
                  <Strikethrough size={14} />
                </button>

                {/* Highlight Dropdown */}
                <div className="typst-tool-dropdown">
                  <button
                    className="typst-tool-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setHighlightMenuOpen((v) => !v)
                    }}
                    title="Highlight Selection (Ctrl+H)"
                  >
                    <Highlighter size={14} />
                  </button>
                  {highlightMenuOpen && (
                    <div className="typst-dropdown-panel" onClick={(e) => e.stopPropagation()}>
                      <div style={{ fontSize: '0.72rem', color: '#828997', marginBottom: '2px' }}>Highlight Color:</div>
                      <div className="typst-color-palette">
                        {HIGHLIGHT_COLORS.map((c) => (
                          <div
                            key={c.hex}
                            className="typst-color-swatch"
                            style={{ background: c.hex }}
                            title={c.name}
                            onClick={() => applyHighlight(c.hex)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Text Color Dropdown */}
                <div className="typst-tool-dropdown">
                  <button
                    className="typst-tool-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setTextColorMenuOpen((v) => !v)
                    }}
                    title="Text Color"
                  >
                    <Palette size={14} />
                  </button>
                  {textColorMenuOpen && (
                    <div className="typst-dropdown-panel" onClick={(e) => e.stopPropagation()}>
                      <div style={{ fontSize: '0.72rem', color: '#828997', marginBottom: '2px' }}>Text Color:</div>
                      <div className="typst-color-palette">
                        {TEXT_COLORS.map((c) => (
                          <div
                            key={c.hex}
                            className="typst-color-swatch"
                            style={{ background: c.hex }}
                            title={c.name}
                            onClick={() => applyTextColor(c.hex)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Font Size & Headings */}
              <div className="typst-toolbar-group">
                {/* Font Size */}
                <div className="typst-tool-dropdown">
                  <button
                    className="typst-tool-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFontSizeMenuOpen((v) => !v)
                    }}
                    title="Font Size"
                    style={{ width: 'auto', padding: '0 6px', fontSize: '0.75rem' }}
                  >
                    <Type size={13} style={{ marginRight: '2px' }} /> Size
                  </button>
                  {fontSizeMenuOpen && (
                    <div className="typst-dropdown-panel" onClick={(e) => e.stopPropagation()}>
                      {FONT_SIZES.map((size) => (
                        <button
                          key={size}
                          className="typst-dropdown-item"
                          onClick={() => applyFontSize(size)}
                        >
                          {size} pt
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Headings */}
                <div className="typst-tool-dropdown">
                  <button
                    className="typst-tool-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setHeadingMenuOpen((v) => !v)
                    }}
                    title="Headings"
                    style={{ width: 'auto', padding: '0 6px', fontSize: '0.75rem' }}
                  >
                    Heading
                  </button>
                  {headingMenuOpen && (
                    <div className="typst-dropdown-panel" onClick={(e) => e.stopPropagation()}>
                      <button className="typst-dropdown-item" onClick={() => applyHeading(1)}>
                        <Heading1 size={13} /> Heading 1 (= Title)
                      </button>
                      <button className="typst-dropdown-item" onClick={() => applyHeading(2)}>
                        <Heading2 size={13} /> Heading 2 (== Section)
                      </button>
                      <button className="typst-dropdown-item" onClick={() => applyHeading(3)}>
                        <Heading3 size={13} /> Heading 3 (=== Sub-section)
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Alignment: Left, Center, Right */}
              <div className="typst-toolbar-group">
                <button className="typst-tool-btn" onClick={() => applyAlign('left')} title="Align Left">
                  <AlignLeft size={14} />
                </button>
                <button className="typst-tool-btn" onClick={() => applyAlign('center')} title="Align Center">
                  <AlignCenter size={14} />
                </button>
                <button className="typst-tool-btn" onClick={() => applyAlign('right')} title="Align Right">
                  <AlignRight size={14} />
                </button>
              </div>

              {/* Structure Blocks */}
              <div className="typst-toolbar-group">
                <button className="typst-tool-btn" onClick={insertPageBreak} title="Insert Page Break">
                  <CornerDownLeft size={14} />
                </button>
                <button className="typst-tool-btn" onClick={insertHLine} title="Insert Horizontal Rule">
                  <Minus size={14} />
                </button>
                <button
                  className="typst-tool-btn"
                  onClick={insertBoxCard}
                  title="Insert Card / Box"
                  style={{ width: 'auto', padding: '0 5px', fontSize: '0.72rem' }}
                >
                  + Box
                </button>
                <button
                  className="typst-tool-btn"
                  onClick={insertNoteCallout}
                  title="Insert Note Callout"
                  style={{ width: 'auto', padding: '0 5px', fontSize: '0.72rem' }}
                >
                  + Note
                </button>

                {/* Table Dropdown */}
                <div className="typst-tool-dropdown typst-table-dropdown">
                  <button
                    className="typst-tool-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setTableMenuOpen((v) => !v)
                    }}
                    title="Table Tools"
                    style={{ width: 'auto', padding: '0 5px', fontSize: '0.72rem' }}
                  >
                    <TableIcon size={13} style={{ marginRight: '2px' }} /> Table
                  </button>
                  {tableMenuOpen && (
                    <div className="typst-dropdown-panel" onClick={(e) => e.stopPropagation()}>
                      <button className="typst-dropdown-item" onClick={insertCustomTable}>
                        + Insert 3-Col Table
                      </button>
                      <button
                        className="typst-dropdown-item"
                        onClick={insertTableCellHighlight}
                      >
                        Highlight Table Cell
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Detached Document setup control (left-aligned). Hidden when the
                  template owns page setup from EE.setup. */}
              <button
                className={`typst-doc-setup-btn ${editorMode === 'document' ? 'active' : ''}`}
                onClick={() => {
                  setFindBarOpen(false)
                  if (editorMode !== 'document') {
                    const parsed = parseDocumentSettingsFromTypst(code, documentSettings)
                    setDocumentSettings(parsed)
                  }
                  setEditorMode((m) => (m === 'document' ? 'code' : 'document'))
                }}
                title="Document setup (page size, margins, fonts)"
              >
                <Palette size={13} /> Document setup
              </button>

              <button
                className={`typst-doc-setup-btn ${editorMode === 'gallery' ? 'active' : ''}`}
                onClick={() => {
                  setFindBarOpen(false)
                  setEditorMode((m) => (m === 'gallery' ? 'code' : 'gallery'))
                }}
                title="Media & Variables Gallery (Images, Charts, Variables & AI prompt helper)"
              >
                <ImageIcon size={13} /> Media & Variables
                {mediaCount > 0 && <span className="typst-badge-count">{mediaCount}</span>}
              </button>



              {/* Find & Replace toggle */}
              <button
                className={`typst-tool-btn ${findBarOpen ? 'active' : ''}`}
                onClick={() => {
                  setEditorMode('code')
                  setFindBarOpen((v) => !v)
                }}
                title="Find & Replace (Ctrl+F)"
              >
                <Search size={14} />
              </button>
            </div>

            {/* Find & Replace Bar */}
            {findBarOpen && editorMode === 'code' && (
              <div className="typst-find-bar">
                <input
                  type="text"
                  className="typst-find-input"
                  placeholder="Find text…"
                  value={findQuery}
                  onChange={(e) => setFindQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFindNext()}
                />
                <input
                  type="text"
                  className="typst-find-input"
                  placeholder="Replace with…"
                  value={replaceQuery}
                  onChange={(e) => setReplaceQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleReplace()}
                />
                <button className="btn-mini ghost" onClick={handleFindNext}>Find Next</button>
                <button className="btn-mini ghost" onClick={handleReplace}>Replace</button>
                <button className="btn-mini ghost" onClick={handleReplaceAll}>Replace All</button>
                <button className="btn-mini ghost" onClick={() => setFindBarOpen(false)}><X size={12} /></button>
              </div>
            )}

            {/* One source-authoritative CodeMirror document. Code mode = raw Typst;
                Visual mode decorates THE SAME document with runtime chips + widgets. */}
            <div
              className="typst-code-editor-wrapper is-code"
              style={{
                height: 'calc(100% - 42px)',
                display: editorMode === 'code' ? 'flex' : 'none'
              }}
            >
              <CodeMirror
                ref={editorRef}
                value={code}
                height="100%"
                theme={eEstimateCodeTheme}
                extensions={editorExtensions}
                onChange={(value) => setCode(value)}
                style={{ width: '100%', height: '100%', fontSize: '12.5px' }}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: true,
                  highlightSpecialChars: true,
                  history: true,
                  foldGutter: true,
                  drawSelection: true,
                  dropCursor: true,
                  allowMultipleSelections: true,
                  indentOnInput: true,
                  syntaxHighlighting: true,
                  bracketMatching: true,
                  closeBrackets: true,
                  autocompletion: true,
                  rectangularSelection: true,
                  crosshairCursor: true,
                  highlightActiveLine: true,
                  highlightSelectionMatches: true,
                  closeBracketsKeymap: true,
                  defaultKeymap: true,
                  searchKeymap: true,
                  historyKeymap: true,
                  foldKeymap: true,
                  completionKeymap: true,
                  lintKeymap: true
                }}
              />
            </div>
            <div
              className="typst-document-settings-wrapper"
              style={{ display: editorMode === 'document' ? 'block' : 'none' }}
            >
              <DocumentSettingsPanel
                settings={documentSettings}
                inherited={usesProjectDocumentSettings}
                onChange={handleDocumentSettingsChange}
                onUseProjectDefaults={useProjectDefaults}
              />
            </div>
            <div
              className="typst-gallery-wrapper"
              style={{
                height: 'calc(100% - 42px)',
                display: editorMode === 'gallery' ? 'block' : 'none',
                overflow: 'hidden'
              }}
            >
              <MediaVariablesGallery
                runtimeData={runtimeData}
                typstSource={code}
                variableRootName={code.match(/#let\s+(Lead|Seigniorage|DataBook|Bund|EE)\s*=/)?.[1]}
                onInsertCode={insertSnippet}
                onClose={() => setEditorMode('code')}
                documentSettings={documentSettings}
              />
            </div>
          </div>

          {/* Right Pane: Live PDF Vector Preview (Overleaf Style) */}
          <div className="typst-studio-right-pane">
            {/* Recompile and preview toolbar */}
            <div className="typst-preview-toolbar">
              <button
                className="typst-recompile-btn"
                disabled={compileLoading}
                onClick={() => void runCompile(code)}
                title={
                  assembleCompile
                    ? 'Compile the full project book from current Print Studio sources'
                    : 'Compile your current script with current project values'
                }
              >
                {compileLoading ? (
                  <>
                    <Zap size={13} className="spin" /> Compiling…
                  </>
                ) : (
                  <>
                    <RefreshCw size={12} /> Recompile
                  </>
                )}
              </button>

              {lastCompiledSource === code && compileTimeMs !== null && !compileError && (
                <span style={{ fontSize: '0.75rem', color: '#98c379' }}>
                  Compiled in {compileTimeMs}ms
                </span>
              )}
              {lastCompiledSource !== code && !compileLoading && (
                <span style={{ fontSize: '0.75rem', color: '#e5c07b' }}>
                  {lastCompiledSource === null ? 'Press Recompile to preview' : 'Changes not compiled'}
                </span>
              )}

              <div className="typst-preview-controls-right">
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
            </div>

            {notice && (
              <div className="typst-notice-banner" role="status">
                {notice}
              </div>
            )}
            {compileError && (
              <div className="typst-error-banner">
                <b>Compilation Error:</b> {compileError}
              </div>
            )}
            {saveError && <div className="typst-error-banner" role="alert">Action failed: {saveError}</div>}

            {/* Smooth Scrollable Preview Area */}
            <div ref={scrollContainerRef} className="typst-preview-scroll-area">
              {compiledPdfUrl && (
                <PdfPageStack src={compiledPdfUrl} zoom={zoom} />
              )}
            </div>
            {issues.length > 0 && !compileLoading && !compileError && lastCompiledSource === code && (
              <div className="typst-content-issues">
                {issuesOpen && <section className="typst-content-issues-panel" aria-label="Print content issues">
                  <strong>Project content not verified in this print</strong>
                  <p>These current project records need printing. Layout settings are excluded.</p>
                  <button className="btn ghost" onClick={() => void navigator.clipboard.writeText(printIssuesForAi(issues)).catch(err => setSaveError(String(err)))}>Copy to AI</button>
                  <button className="btn ghost" onClick={() => setIssuesOpen(false)}>Close</button>
                  <ul>{issues.map(issue => <li key={issue.id}><strong>{issue.label}</strong><div>{issue.status === 'missing' ? 'No printing marker found' : 'Unable to verify this custom layout'}</div><code>{issue.path}</code><p>{issue.expected}</p></li>)}</ul>
                </section>}
                <button className="btn" aria-expanded={issuesOpen} onClick={() => setIssuesOpen(v => !v)}>Issues ({issues.length})</button>
              </div>
            )}
          </div>
        </div>

        {/* Hidden printing iframe */}
        {compiledPdfUrl && (
          <iframe
            ref={printFrameRef}
            src={compiledPdfUrl}
            style={{ display: 'none' }}
            title="E-Estimate Print Studio output"
          />
        )}
      </div>
    </div>
  )
}
