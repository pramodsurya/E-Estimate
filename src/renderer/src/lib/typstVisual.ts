/**
 * CodeMirror source-authoritative "visual" layer for Typst.
 *
 * Research prototype proving Code Mode and Visual Mode are views over ONE
 * canonical document — the Typst source string. Unlike the current
 * Penwright/TipTap editor (a second ProseMirror document that must serialize
 * back to Typst), this does NOT maintain a separate document. It decorates the
 * live CodeMirror editor:
 *
 *  - `#EE_YEAR` / `#EE.summary.grand_total` / `#EE_PROJECT` → a read-only runtime
 *    chip widget, backed by the untouched `#EE_YEAR` source range.
 *  - `#ee-group-table(...)` → a live runtime table widget (rows from runtime
 *    data) with editable header cells that write back to their source ranges.
 *
 * Runtime values come from a CodeMirror Facet (never written into the doc), so
 * the source stays canonical and byte-stable; nothing is serialized back.
 */

import { Facet, StateEffect, StateField, type Extension, type Range } from '@codemirror/state'
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import {
  scanVariables,
  scanGroupTable,
  valueFor,
  type EeTableHeaderCell,
  type EeVariableExpression,
  type VariableMatch
} from './typstVisualScan'

/** Runtime data (e.g. `SeigniorageRenderData`) supplied to widgets. */
export const eeRuntime = Facet.define<unknown, unknown>({
  // `state.facet(facet)` returns an array of provider values by default; reduce
  // to the single runtime payload so widgets read it directly.
  combine: (values) => values[values.length - 1] ?? null
})

/* ------------------------------------------------------------------ */
/* Widgets                                                             */
/* ------------------------------------------------------------------ */

/** Read-only chip backing a runtime expression; reveals source syntax on hover. */
export class EeVariableWidget extends WidgetType {
  constructor(
    private readonly expr: string,
    private readonly display: string,
    private readonly title: string
  ) {
    super()
  }
  eq(other: EeVariableWidget): boolean {
    return other.expr === this.expr && other.display === this.display
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'ee-var-chip'
    span.textContent = this.display
    span.title = this.title
    span.setAttribute('contenteditable', 'false')
    span.setAttribute('data-ee-var', this.expr)
    return span
  }
  ignoreEvent(): boolean {
    return true // read-only: cursor skips inside the chip
  }
}

/**
 * Live runtime table replacing `#ee-group-table(...)`. Header cells are
 * editable and write back to their source ranges on blur; data rows are
 * read-only and come from runtime data.
 */
export class EeTableWidget extends WidgetType {
  private view: EditorView | null = null
  constructor(
    private readonly headers: EeTableHeaderCell[],
    private readonly source: string,
    private readonly runtime: unknown
  ) {
    super()
  }
  eq(other: EeTableWidget): boolean {
    return other.source === this.source && other.runtime === this.runtime
  }
  toDOM(view: EditorView): HTMLElement {
    this.view = view
    const wrap = document.createElement('div')
    wrap.className = 'ee-runtime-table'
    const table = document.createElement('table')
    const thead = document.createElement('thead')
    const headerRow = document.createElement('tr')
    for (const header of this.headers) {
      const th = document.createElement('th')
      th.className = 'ee-cell ee-header'
      th.textContent = header.text
      th.contentEditable = 'true'
      th.title = 'Edit this header (updates the Typst source)'
      th.addEventListener('blur', () => this.commitHeader(header, th, view))
      headerRow.appendChild(th)
    }
    thead.appendChild(headerRow)
    table.appendChild(thead)

    const body = document.createElement('tbody')
    const groups = (this.runtime as { groups?: Array<{ rows?: Array<Record<string, string>> }> })?.groups ?? []
    for (const group of groups) {
      for (const row of group.rows ?? []) {
        const tr = document.createElement('tr')
        const cells = [
          row.sl, row.description, row.total_qty, row.seigniorage_qty,
          row.rate, row.seigniorage, row.dmft, row.smft, row.permit_fee
        ]
        for (const text of cells) {
          if (text === undefined || text === null) continue
          const td = document.createElement('td')
          td.className = 'ee-cell'
          td.textContent = String(text)
          td.contentEditable = 'false'
          tr.appendChild(td)
        }
        body.appendChild(tr)
      }
    }
    table.appendChild(body)
    wrap.appendChild(table)
    return wrap
  }
  ignoreEvent(): boolean {
    return true // widget owns its DOM; header blur commits edits back to source
  }

  private commitHeader(header: EeTableHeaderCell, th: HTMLElement, view: EditorView): void {
    // `header.from..header.to` is the whole `[...]` token; replace it with a
    // single-bracketed cell so an edit never produces `[[...]]`.
    const next = (th.textContent ?? '').trim()
    const replacement = `[${next}]`
    view.dispatch({
      changes: { from: header.from, to: header.to, insert: replacement },
      selection: { anchor: header.from }
    })
  }
}

/* ------------------------------------------------------------------ */
/* Decoration field                                                    */
/* ------------------------------------------------------------------ */

function buildDecorations(state: { doc: { toString(): string } }, runtime: unknown): DecorationSet {
  const text = state.doc.toString()
  const decos: Range<Decoration>[] = []

  const variables = scanVariables(text)
  for (const v of variables) {
    const { value, title } = valueFor(v.expr, runtime)
    decos.push(
      Decoration.replace({ widget: new EeVariableWidget(v.expression, value || v.expression, title) }).range(v.from, v.to)
    )
  }
  for (const t of scanGroupTable(text)) {
    decos.push(
      Decoration.replace({
        widget: new EeTableWidget(t.headers, text.slice(t.from, t.to), runtime)
      }).range(t.from, t.to)
    )
  }
  return Decoration.set(decos, true)
}

export const visualDecorationField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state, state.facet(eeRuntime))
  },
  update(value, tr) {
    if (tr.docChanged || tr.effects.some((e) => e.is(changeRuntime))) {
      return buildDecorations(tr.state, tr.state.facet(eeRuntime))
    }
    return value
  },
  provide(field) {
    return EditorView.decorations.from(field)
  }
})

export const changeRuntime = StateEffect.define<unknown>()

/** Enable the source-authoritative visual decorations over the live document. */
export function visualMarkupExtension(): Extension {
  return visualDecorationField
}
