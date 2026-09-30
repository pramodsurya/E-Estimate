import { useCallback, useEffect } from 'react'
import { Link2Off, CornerDownLeft } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { findNode } from '../../lib/tree'
import { nodeDisplayName } from '../nodeVisual'
import { cellToA1 } from '../../lib/finalNumber'

const OPERATORS = ['+', '-', '*', '/', '(', ')', ','] as const

/**
 * Excel-style point-mode banner. Rendered above the editor so it survives
 * sheet switches: it always shows WHERE the pending formula will land and
 * WHAT it holds, plus how to finish or abandon it.
 */
export default function FormulaLinkBanner(): JSX.Element | null {
  const link = useStore((state) => state.formulaLink)
  const project = useStore((state) => state.project)
  const selectedId = useStore((state) => state.selectedId)
  const select = useStore((state) => state.select)
  const appendFormulaLinkText = useStore((state) => state.appendFormulaLinkText)
  const cancelFormulaLink = useStore((state) => state.cancelFormulaLink)
  const requestFormulaLinkCommit = useStore((state) => state.requestFormulaLinkCommit)
  const clearFormulaLink = useStore((state) => state.clearFormulaLink)

  const commit = useCallback((): void => {
    const state = useStore.getState()
    const live = state.formulaLink
    if (!live || !project || !findNode(project.root, live.originItemId)) {
      clearFormulaLink()
      return
    }
    requestFormulaLinkCommit()
    if (state.selectedId !== live.originItemId) select(live.originItemId)
  }, [project, clearFormulaLink, requestFormulaLinkCommit, select])

  useEffect(() => {
    if (!link) return
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      if (event.key === 'Escape') {
        cancelFormulaLink()
        return
      }
      if (event.key === 'Enter' || event.key === 'Return' || event.code === 'NumpadEnter') {
        // While still editing the origin cell, let Univer finish an ordinary
        // formula. Point mode only owns Enter after a source cell was picked.
        if (selectedId === link.originItemId && !link.text.includes('ITEMCELL(')) {
          cancelFormulaLink()
          return
        }
        event.preventDefault()
        event.stopImmediatePropagation()
        commit()
        return
      }
      if (typing && !target.closest('.univer-editor-host')) return
      if (selectedId === link.originItemId) return
      if ((OPERATORS as readonly string[]).includes(event.key)) {
        event.preventDefault()
        appendFormulaLinkText(event.key)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [link, selectedId, project, commit, appendFormulaLinkText, cancelFormulaLink, requestFormulaLinkCommit, clearFormulaLink, select])

  if (!link || !project) return null

  const origin = findNode(project.root, link.originItemId)
  const originLabel = origin ? nodeDisplayName(origin) : 'removed item'
  const targetA1 = cellToA1(link.target.row, link.target.column)

  return (
    <div
      className="et-formula-link"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        padding: '6px 10px',
        borderBottom: '2px solid var(--accent, #2f6fed)',
        background: 'rgba(47,111,237,0.07)',
        fontSize: 12
      }}
      role="status"
      aria-live="polite"
      title="You are referencing other sheets — the formula below lands in the origin cell on Enter"
    >
      <span style={{ fontWeight: 700 }}>fx</span>
      <span>
        Referencing from <strong>{originLabel}!{targetA1}</strong>
      </span>
      <code
        style={{
          fontFamily: 'monospace',
          background: 'rgba(0,0,0,0.06)',
          padding: '2px 8px',
          borderRadius: 4,
          maxWidth: 420,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {link.text || '='}
      </code>
      <span style={{ display: 'inline-flex', gap: 4 }} aria-label="Operators">
        {OPERATORS.map((op) => (
          <button
            key={op}
            type="button"
            className="btn-mini"
            style={{ minWidth: 26 }}
            onClick={() => appendFormulaLinkText(op)}
          >
            {op}
          </button>
        ))}
      </span>
      <button type="button" className="btn-mini" onClick={commit} title="Write the formula into the origin cell (Enter)">
        <CornerDownLeft size={12} /> Finish
      </button>
      <button type="button" className="btn-mini ghost" onClick={cancelFormulaLink} title="Abandon the pending formula (Esc)">
        <Link2Off size={12} /> Cancel
      </button>
      <span style={{ color: 'var(--text-faint)' }}>Click to pick, click again to correct, or drag a range · Enter finishes · Esc cancels</span>
    </div>
  )
}
