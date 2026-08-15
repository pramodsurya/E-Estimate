import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, FileSpreadsheet, FileText, Printer, Scale } from 'lucide-react'
import type { EestimateProject, MaterialRateOverride } from '../../types/project'
import {
  buildComparativeStatement,
  collectHandTypedRates,
  comparativeScope,
  scopeItemIds,
  type ComparativeScopeNode,
  type ComparativeSide,
  type ComparativeStatement,
  type HandTypedRate,
  type RateAnswers
} from '../../lib/comparativeStatement'
import { buildComparativeWorkbook } from '../../lib/comparativeExcel'
import { nodeDisplayName } from '../nodeVisual'
import type { ComparativeRow } from '../../lib/comparativeRows'
import { fetchSorYears } from '../../lib/masterData'
import {
  circularsFromPeriods,
  fetchMaterialAliases,
  fetchMaterialRatePeriods,
  fetchMonthlyMaterials,
  fetchYearlyMaterialRates,
  formatCircularMonth,
  materialCodesInRecipe,
  periodAt,
  resolveMaterialRate,
  type MaterialRatePeriod,
  type MonthlyMaterial
} from '../../lib/materialRates'
import { previewPdfOptions, previewPrintHtml, splitPreviewPages } from '../../lib/previewPrint'
import {
  chooseSmartAbstractPlan,
  FILL_EACH_PAGE,
  type SmartAbstractProfile
} from '../../lib/smartAbstractPagination'
import { outerHeight, readMeasuredDocument } from '../../lib/measuredPrintDocument'
import { PAPER_MM, PX_PER_MM } from '../../lib/printRender'
import appCss from '../../styles/styles.css?inline'

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})
const percentFormat = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

/** The two categories a comparative statement is normally re-based on. */
const COMPARED_MATERIAL_CATEGORIES = ['CEMENT', 'STEEL', 'STEEL_IRON']

/**
 * The statement's page frame, as real print margins rather than page padding.
 *
 * A component with forty items runs past one sheet, and padding on the page box
 * is laid out once for the whole box: it would reach the top of the first sheet
 * and the foot of the last, leaving every sheet between it hard against the
 * paper edge. Margins are charged to every sheet. In inches, as printToPDF
 * takes them.
 */
const PRINT_MARGIN_MM = { top: 12, bottom: 12, left: 10, right: 10 }
const PRINT_MARGINS = {
  top: PRINT_MARGIN_MM.top / 25.4,
  bottom: PRINT_MARGIN_MM.bottom / 25.4,
  left: PRINT_MARGIN_MM.left / 25.4,
  right: PRINT_MARGIN_MM.right / 25.4
}

/**
 * On paper the page box is not a page — the print engine paginates, so the box
 * gives up its fixed size and its padding, and the table head repeats on every
 * sheet a long component spills onto.
 */
const PRINT_CSS = `
  .cs-page{width:auto!important;min-height:0!important;padding:0!important;
    border:none!important;box-shadow:none!important}
  /* Each sheet was planned against measured rows, so it starts a page and is
     never split again — the engine re-breaking them would undo the plan. */
  .cs-page + .cs-page{break-before:page;page-break-before:always}
  .cs-table tr{break-inside:avoid;page-break-inside:avoid}
  .cs-page-head{break-after:avoid;page-break-after:avoid}
  .cs-component-total{break-before:avoid;page-break-before:avoid}
`

type Side = 'left' | 'right'

function amountCell(value: number | null): string {
  return value === null ? '—' : money.format(value)
}

function percentCell(value: number | null): string {
  // A blank is the honest answer where there is no base to compare against.
  return value === null ? '—' : `${percentFormat.format(value)}%`
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return btoa(binary)
}

/**
 * The column model, shared by what is rendered and what is measured.
 *
 * These have to be the same markup. Measuring a table without its colgroup lets
 * `table-layout: fixed` divide the width equally, which squeezes the clause into
 * a tenth of the sheet, wraps every row to a dozen lines, and plans one row to a
 * page — which is exactly what it did.
 */
const COLUMN_WIDTHS = {
  items: ['4%', '34%', '6%', '8%', '8%', '8%', '10%', '10%', '9%', '6%'],
  summary: ['6%', '46%', '15%', '15%', '12%', '6%']
} as const

const COLGROUP_HTML = {
  items: `<colgroup>${COLUMN_WIDTHS.items.map((w) => `<col style="width:${w}">`).join('')}</colgroup>`,
  summary: `<colgroup>${COLUMN_WIDTHS.summary.map((w) => `<col style="width:${w}">`).join('')}</colgroup>`
}

function headRowHtmlFor(leftYear: string, rightYear: string, showRates: boolean): string {
  const cells = showRates
    ? ['Sl.', 'Description', 'Unit', 'Quantity', `Rate ${leftYear}`, `Rate ${rightYear}`,
       `Amount ${leftYear}`, `Amount ${rightYear}`, 'Difference', '%']
    : ['Sl.', 'Description', `Amount ${leftYear}`, `Amount ${rightYear}`, 'Difference', '%']
  return `<tr>${cells.map((cell) => `<th>${cell}</th>`).join('')}</tr>`
}

/** The same row the table renders, as markup the measuring frame can lay out. */
function measurableRowHtml(row: ComparativeRow, showRates: boolean): string {
  const cell = (value: number | null): string => (value === null ? '—' : money.format(value))
  const money_ = (value: number | null | undefined): string =>
    value === null || value === undefined ? '' : money.format(value)
  const rates = showRates
    ? `<td class="cs-unit">${row.unit ?? ''}</td>` +
      `<td class="cs-number">${money_(row.quantity)}</td>` +
      `<td class="cs-number">${cell(row.leftRate ?? null)}</td>` +
      `<td class="cs-number">${cell(row.rightRate ?? null)}</td>`
    : ''
  return (
    `<tr class="cs-row-${row.kind}"><td class="cs-sl">${row.slNo ?? ''}</td>` +
    `<td class="cs-description"><strong>${row.label}</strong>` +
    (row.description ? `<span>${row.description}</span>` : '') +
    `</td>${rates}` +
    `<td class="cs-number">${cell(row.left)}</td>` +
    `<td class="cs-number">${cell(row.right)}</td>` +
    `<td class="cs-number">${row.difference === 0 ? '—' : money.format(row.difference)}</td>` +
    `<td class="cs-number">${percentCell(row.percent)}</td></tr>`
  )
}

/**
 * How many rows of this statement fit on a sheet, measured rather than assumed.
 *
 * A description column that wraps to three lines on one row and one on the next
 * makes every estimated height wrong, so the rows are laid out once at the
 * printable width and read back — the same approach the component abstract
 * uses. The plan then fills each sheet as far as it goes: a comparative
 * statement is read down a column, and holding rows back to stock the last page
 * only spreads it over more paper.
 */
async function planPages(
  rows: ComparativeRow[],
  headHtml: string,
  headRowHtml: string,
  showRates: boolean,
  bodyHtmlFor: (row: ComparativeRow) => string,
  css: string
): Promise<ComparativeRow[][]> {
  const tableClass = `cs-table ${showRates ? 'cs-table-items' : 'cs-table-summary'}`
  const widthPx =
    (PAPER_MM.A4.h - PRINT_MARGIN_MM.left - PRINT_MARGIN_MM.right) * PX_PER_MM
  const usablePx =
    (PAPER_MM.A4.w - PRINT_MARGIN_MM.top - PRINT_MARGIN_MM.bottom) * PX_PER_MM - 6

  const measureHtml =
    `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>` +
    `<body><div class="cs-page" data-measure="1">${headHtml}` +
    `<table class="${tableClass}">${COLGROUP_HTML[showRates ? 'items' : 'summary']}` +
    `<thead>${headRowHtml}</thead>` +
    `${rows
      .map((row, index) => bodyHtmlFor(row).replace('<tr', `<tr data-row="${index}"`))
      .join('')}</table></div></body></html>`

  const measured = await readMeasuredDocument(measureHtml, widthPx, (doc) => {
    const heights = new Array<number>(rows.length).fill(0)
    doc.querySelectorAll('[data-row]').forEach((element) => {
      const index = Number(element.getAttribute('data-row'))
      if (index >= 0 && index < heights.length) heights[index] = outerHeight(element)
    })
    if (heights.some((height) => !(height > 0))) return null
    return {
      heights,
      head: outerHeight(doc.querySelector('.cs-page-head')),
      thead: outerHeight(doc.querySelector('.cs-table thead'))
    }
  })
  // Without a measurement the engine paginates it, as it did before.
  if (!measured) return [rows]

  const flow = usablePx - measured.thead
  const profile: SmartAbstractProfile<ComparativeRow> = {
    density: 'normal',
    rows: rows.map((row, index) => ({
      value: row,
      height: measured.heights[index],
      detail: row.kind === 'item' || row.kind === 'component',
      // A total belongs to the rows above it and may not open a sheet.
      keepWithPrevious: row.kind === 'total' || row.kind === 'grand'
    })),
    capacities: {
      first: flow - measured.head,
      continuation: flow,
      finalFirst: flow - measured.head,
      finalContinuation: flow
    }
  }
  return chooseSmartAbstractPlan([profile], FILL_EACH_PAGE).pages.map((page) =>
    page.rows.map((row) => row.value)
  )
}

function ComparisonTable({
  rows,
  leftYear,
  rightYear,
  showRates
}: {
  rows: ComparativeRow[]
  leftYear: string
  rightYear: string
  showRates: boolean
}): JSX.Element {
  return (
    <table className={`cs-table${showRates ? ' cs-table-items' : ' cs-table-summary'}`}>
      {/* Fixed widths: without them the ten money columns are sized by their
          longest figure and the description is squeezed to nothing. */}
      <colgroup>
        {COLUMN_WIDTHS[showRates ? 'items' : 'summary'].map((width, index) => (
          <col key={index} style={{ width }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th>Sl.</th>
          <th>Description</th>
          {showRates && <th>Unit</th>}
          {showRates && <th>Quantity</th>}
          {showRates && <th>Rate {leftYear}</th>}
          {showRates && <th>Rate {rightYear}</th>}
          <th>Amount {leftYear}</th>
          <th>Amount {rightYear}</th>
          <th>Difference</th>
          <th>%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className={`cs-row-${row.kind}`}>
            <td className="cs-sl">{row.slNo ?? ''}</td>
            <td className="cs-description">
              <strong>{row.label}</strong>
              {row.description ? <span>{row.description}</span> : null}
            </td>
            {showRates && <td className="cs-unit">{row.unit ?? ''}</td>}
            {showRates && (
              <td className="cs-number">
                {row.quantity === null || row.quantity === undefined
                  ? ''
                  : money.format(row.quantity)}
              </td>
            )}
            {showRates && <td className="cs-number">{amountCell(row.leftRate ?? null)}</td>}
            {showRates && <td className="cs-number">{amountCell(row.rightRate ?? null)}</td>}
            <td className="cs-number">{amountCell(row.left)}</td>
            <td className="cs-number">{amountCell(row.right)}</td>
            <td
              className={`cs-number ${row.difference > 0 ? 'cs-up' : row.difference < 0 ? 'cs-down' : ''}`}
            >
              {row.difference === 0 ? '—' : money.format(row.difference)}
            </td>
            <td className="cs-number">{percentCell(row.percent)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}


function ScopeBranch({
  scope,
  depth,
  chosen,
  onToggle
}: {
  scope: ComparativeScopeNode
  depth: number
  chosen: Set<string>
  onToggle: (ids: string[], on: boolean) => void
}): JSX.Element {
  const ids = scopeItemIds(scope)
  const selected = ids.filter((id) => chosen.has(id)).length
  const all = ids.length > 0 && selected === ids.length
  // Part-selected has to look different from both, or a component with one item
  // left in it reads as fully included.
  const some = selected > 0 && !all
  return (
    <div className="cs-scope-branch" style={{ marginLeft: depth * 18 }}>
      <label className="cs-scope-row cs-scope-section">
        <input
          type="checkbox"
          checked={all}
          ref={(element) => {
            if (element) element.indeterminate = some
          }}
          onChange={(event) => onToggle(ids, event.target.checked)}
        />
        <span>{scope.node.name}</span>
        <small>
          {selected}/{ids.length}
        </small>
      </label>
      {scope.items.map((item) => (
        <label className="cs-scope-row cs-scope-item" key={item.id}>
          <input
            type="checkbox"
            checked={chosen.has(item.id)}
            onChange={(event) => onToggle([item.id], event.target.checked)}
          />
          <span>{nodeDisplayName(item)}</span>
        </label>
      ))}
      {scope.children.map((child) => (
        <ScopeBranch
          key={child.node.id}
          scope={child}
          depth={depth + 1}
          chosen={chosen}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

export default function ComparativeStatementPanel({
  project,
  onClose
}: {
  project: EestimateProject
  onClose: () => void
}): JSX.Element {
  const [years, setYears] = useState<string[]>([])
  const [materials, setMaterials] = useState<MonthlyMaterial[]>([])
  const [leftYear, setLeftYear] = useState('')
  const [rightYear, setRightYear] = useState(project.meta.sorYear ?? '')
  const [rates, setRates] = useState<Record<Side, Record<string, string>>>({
    left: {},
    right: {}
  })
  const [answers, setAnswers] = useState<Record<Side, RateAnswers>>({ left: {}, right: {} })
  const [statement, setStatement] = useState<ComparativeStatement | null>(null)
  /** Sheets of rows, decided by measurement — see `planPages`. */
  const [pages, setPages] = useState<{
    abstract: ComparativeRow[][]
    lead: ComparativeRow[][]
    components: Record<string, ComparativeRow[][]>
  }>({ abstract: [], lead: [], components: {} })
  const [stage, setStage] = useState<'scope' | 'setup' | 'building' | 'ready'>('scope')
  // Every item to begin with: the common case is the whole work, and starting
  // from nothing selected would make that the most tedious path.
  const scope = useMemo(() => comparativeScope(project), [project])
  const allItemIds = useMemo(() => scope.flatMap(scopeItemIds), [scope])
  const [chosen, setChosen] = useState<Set<string>>(() => new Set())
  const [scopeReady, setScopeReady] = useState(false)
  const [includeLead, setIncludeLead] = useState(true)
  /** What each side will use where a box is left blank — see `fallbackRate`. */
  const [periods, setPeriods] = useState<MaterialRatePeriod[]>([])
  /**
   * Which G.O. circular each column adopts, by its effective-from date. Empty
   * means the column uses the rate published for its own SOR year.
   *
   * This is a per-column choice rather than the project's own pricing date. One
   * date applied to both columns resolves to one circular, so cement and steel
   * came out identical on both sides whatever years were chosen, and the year
   * selector looked broken. The comparison is between schedules, so each side
   * has to be free to sit on its own.
   */
  const [circularFrom, setCircularFrom] = useState<Record<Side, string>>({
    left: '',
    right: ''
  })
  /** Cement and steel this estimate actually consumes — see the loader below. */
  const [usedCodes, setUsedCodes] = useState<Set<string>>(new Set())
  const [showAllMaterials, setShowAllMaterials] = useState(false)
  const [yearlyRates, setYearlyRates] = useState<Record<Side, Map<string, number>>>({
    left: new Map(),
    right: new Map()
  })
  const hasLead = (project.leadChart?.applications ?? []).length > 0
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const pagesRef = useRef<HTMLDivElement>(null)

  const handTyped = useMemo(() => collectHandTypedRates(project), [project])

  useEffect(() => {
    if (scopeReady) return
    setChosen(new Set(allItemIds))
    setScopeReady(true)
  }, [allItemIds, scopeReady])

  const toggleItems = (ids: string[], on: boolean): void => {
    setChosen((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const exportWorkbook = async (): Promise<void> => {
    if (!statement || saving) return
    setSaving(true)
    setError(null)
    try {
      const bytes = await buildComparativeWorkbook(project, statement)
      const fileName = `${project.meta.name || 'Estimate'} — Comparative Statement.xlsx`
      // The save channel lives in the preload bundle, which only reloads when
      // Electron restarts — a running app updated in place has not got it yet.
      // The workbook exists either way, so hand it over rather than lose it.
      if (typeof window.api.export.workbook === 'function') {
        await window.api.export.workbook(encodeBase64(bytes), fileName)
      } else {
        const copy = new ArrayBuffer(bytes.byteLength)
        new Uint8Array(copy).set(bytes)
        const url = URL.createObjectURL(
          new Blob([copy], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          })
        )
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = fileName
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 20000)
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      fetchSorYears(),
      fetchMonthlyMaterials(),
      fetchMaterialAliases(),
      fetchMaterialRatePeriods()
    ])
      .then(([loadedYears, loadedMaterials, aliases, loadedPeriods]) => {
        setPeriods(loadedPeriods)
        if (cancelled) return
        setYears(loadedYears)
        // Only the cement and steel this estimate actually consumes. Offering
        // every published grade asks the estimator to read nine boxes to find
        // the two their work uses.
        //
        // The compiled snapshot is not enough on its own: it is absent until the
        // dashboard has been built, and a DATA the estimator edited by hand lives
        // in the override maps. Reading all three is what makes the short list
        // appear on a real estimate instead of falling back to every grade.
        const used = new Set<string>()
        const noteRecipe = (recipe: Parameters<typeof materialCodesInRecipe>[0]): void => {
          for (const code of materialCodesInRecipe(recipe, aliases)) used.add(code)
        }
        for (const recipe of Object.values(project.dashboardSnapshot?.projectRecipes ?? {})) {
          noteRecipe(recipe)
        }
        for (const recipe of Object.values(project.rateAnalysisOverrides ?? {})) {
          noteRecipe(recipe)
        }
        for (const entries of Object.values(project.rateAnalysisScopedOverrides ?? {})) {
          for (const recipe of Object.values(entries)) noteRecipe(recipe)
        }
        setUsedCodes(used)
        setMaterials(
          loadedMaterials.filter((material) =>
            COMPARED_MATERIAL_CATEGORIES.includes(material.category)
          )
        )
        // Default the past column to the year before the project's own.
        const current = project.meta.sorYear ?? loadedYears[0] ?? ''
        const index = loadedYears.indexOf(current)
        setRightYear(current)
        setLeftYear(index > 0 ? loadedYears[index - 1] : loadedYears[0] ?? '')
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      cancelled = true
    }
  }, [
    project.meta.sorYear,
    project.dashboardSnapshot,
    project.rateAnalysisOverrides,
    project.rateAnalysisScopedOverrides
  ])

  useEffect(() => {
    let cancelled = false
    const load = async (year: string): Promise<Map<string, number>> =>
      year ? fetchYearlyMaterialRates(year) : new Map<string, number>()
    void Promise.all([load(leftYear), load(rightYear)])
      .then(([left, right]) => {
        if (!cancelled) setYearlyRates({ left, right })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [leftYear, rightYear])

  /** The circulars available to adopt, newest first. */
  const circulars = useMemo(
    () => circularsFromPeriods(periods).slice().sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    [periods]
  )

  /**
   * The circular a column has adopted, as real rate overrides.
   *
   * The statement is generated from a shadow project, and that project prices
   * cement and steel from `materialRateOverrides` alone — a pricing date is only
   * a cache key and never reaches the rate lookup. So a circular that is merely
   * displayed would not be the one billed. Turning the choice into overrides is
   * what makes the boxes and the finished statement agree.
   */
  const circularOverrides = (side: Side): Record<string, MaterialRateOverride> => {
    const effectiveFrom = circularFrom[side]
    if (!effectiveFrom) return {}
    const circular = circulars.find((entry) => entry.effectiveFrom === effectiveFrom)
    if (!circular) return {}
    const label = circular.source || `Circular ${formatCircularMonth(effectiveFrom)}`
    const overrides: Record<string, MaterialRateOverride> = {}
    for (const material of materials) {
      const period = periodAt(periods, material.materialCode, effectiveFrom)
      if (!period || !Number.isFinite(period.rate)) continue
      overrides[material.materialCode] = {
        rate: period.rate,
        source: 'MONTHLY_CIRCULAR',
        label,
        effectiveFrom: period.effectiveFrom,
        setAt: new Date().toISOString()
      }
    }
    return overrides
  }

  /**
   * What this side will actually price the material at if the box is left blank.
   *
   * Either the circular this column adopted, or — the default — the rate
   * published for this column's own SOR year. Saying which one is in play, and
   * at what figure, is the only way the estimator can tell whether cement is
   * being compared at all.
   */
  const fallbackRate = (side: Side, materialCode: string): string => {
    const resolved = resolveMaterialRate(materialCode, {
      overrides: circularOverrides(side),
      // A column with no circular adopted must not quietly pick one up: with no
      // periods to search, the year's published rate is what remains.
      periods: [],
      yearlyRates: yearlyRates[side],
      asOf: circularFrom[side] || new Date().toISOString().slice(0, 10),
      sorYear: side === 'left' ? leftYear : rightYear
    })
    if (resolved.rate === null) return 'No published rate — this material will not be priced'
    return `${money.format(resolved.rate)} · ${resolved.label}`
  }

  // A hand-typed rate was a judgement made under one schedule. Fill in the
  // column whose year matches it, and ask for the other.
  useEffect(() => {
    setAnswers((current) => {
      const next: Record<Side, RateAnswers> = {
        left: { ...current.left },
        right: { ...current.right }
      }
      for (const rate of handTyped) {
        if (rate.savedYear === leftYear && next.left[rate.key] === undefined) {
          next.left[rate.key] = rate.savedRate
        }
        if (rate.savedYear === rightYear && next.right[rate.key] === undefined) {
          next.right[rate.key] = rate.savedRate
        }
      }
      return next
    })
  }, [handTyped, leftYear, rightYear])

  const sideFor = (side: Side, year: string): ComparativeSide => {
    // The adopted circular first, then anything hand-typed on top of it: a box
    // the estimator filled in is a judgement and outranks a published figure.
    const overrides: Record<string, MaterialRateOverride> = circularOverrides(side)
    for (const [code, value] of Object.entries(rates[side])) {
      const rate = Number(value)
      if (!value.trim() || !Number.isFinite(rate)) continue
      overrides[code] = {
        rate,
        source: 'MANUAL',
        label: `Comparative statement · ${year}`,
        setAt: new Date().toISOString()
      }
    }
    return { year, materialRateOverrides: overrides, rateAnswers: answers[side] }
  }

  const generate = async (): Promise<void> => {
    if (!leftYear || !rightYear) return
    setStage('building')
    setError(null)
    setProgress('Preparing')
    try {
      const built = await buildComparativeStatement(
        project,
        sideFor('left', leftYear),
        sideFor('right', rightYear),
        // A full selection is the whole estimate, charges and all.
        chosen.size === allItemIds.length ? null : chosen,
        setProgress,
        includeLead
      )
      setProgress('Laying out sheets')
      const headHtml = '<header class="cs-page-head"><div><small>x</small><h1>x</h1><b>x</b></div></header>'
      const css = `${appCss}${PRINT_CSS}`
      const abstractPages = await planPages(
        built.abstractRows,
        headHtml,
        headRowHtmlFor(built.leftYear, built.rightYear, false),
        false,
        (row) => measurableRowHtml(row, false),
        css
      )
      const leadPages =
        built.leadRows.length > 0
          ? await planPages(
              built.leadRows,
              headHtml,
              headRowHtmlFor(built.leftYear, built.rightYear, true),
              true,
              (row) => measurableRowHtml(row, true),
              css
            )
          : []
      const componentPages: Record<string, ComparativeRow[][]> = {}
      for (const component of built.components) {
        componentPages[component.nodeId] = await planPages(
          component.rows,
          headHtml,
          headRowHtmlFor(built.leftYear, built.rightYear, true),
          true,
          (row) => measurableRowHtml(row, true),
          css
        )
      }
      setPages({ abstract: abstractPages, lead: leadPages, components: componentPages })
      setStatement(built)
      setStage('ready')
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setStage('setup')
    }
  }

  const exportPdf = async (): Promise<void> => {
    const host = pagesRef.current
    if (!host || saving) return
    setSaving(true)
    setError(null)
    try {
      const runs = splitPreviewPages(host.innerHTML, '.pp-page', {
        pageSize: 'A4',
        orientation: 'landscape'
      })
      const parts: Uint8Array[] = []
      for (const run of runs) {
        const result = await window.api.print.toPdf(
          previewPrintHtml(run.html, '.pp-page', PRINT_CSS),
          { ...previewPdfOptions(run.pageSize, run.orientation), margins: PRINT_MARGINS }
        )
        if (!result.ok || !result.data) {
          throw new Error(result.error ?? 'Could not render the comparative statement.')
        }
        const binary = atob(result.data)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index)
        }
        parts.push(bytes)
      }
      const { PDFDocument } = await import('pdf-lib')
      const merged = await PDFDocument.create()
      for (const part of parts) {
        const source = await PDFDocument.load(part)
        const pages = await merged.copyPages(source, source.getPageIndices())
        pages.forEach((page) => merged.addPage(page))
      }
      const bytes = await merged.save()
      await window.api.export.pdf(
        encodeBase64(bytes),
        `${project.meta.name || 'Estimate'} — Comparative Statement.pdf`
      )
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  /**
   * The grades worth asking about: the ones this estimate consumes. If nothing
   * could be identified there is nothing to narrow to, so the full list stands
   * rather than an empty panel.
   */
  const visibleMaterials = useMemo(() => {
    if (showAllMaterials || usedCodes.size === 0) return materials
    return materials.filter((material) => usedCodes.has(material.materialCode))
  }, [materials, showAllMaterials, usedCodes])
  // Counted against the narrowed list, not the visible one, so ticking the box
  // does not remove the box.
  const hiddenMaterialCount = useMemo(
    () =>
      usedCodes.size === 0
        ? 0
        : materials.filter((material) => !usedCodes.has(material.materialCode)).length,
    [materials, usedCodes]
  )

  const materialInput = (side: Side, code: string): JSX.Element => (
    <input
      className="text-input"
      type="number"
      min="0"
      step="0.01"
      value={rates[side][code] ?? ''}
      placeholder={fallbackRate(side, code)}
      onChange={(event) =>
        setRates((current) => ({
          ...current,
          [side]: { ...current[side], [code]: event.target.value }
        }))
      }
    />
  )

  if (stage === 'ready' && statement) {
    return (
      <div className="comparative-statement">
        <div className="cs-toolbar">
          <button className="btn ghost" onClick={onClose}>
            <ArrowLeft size={15} /> Dashboard
          </button>
          <button className="btn ghost" onClick={() => setStage('setup')}>
            Change years
          </button>
          <span className="cs-toolbar-title">
            Comparative Statement · {statement.leftYear} → {statement.rightYear}
          </span>
          <button className="btn ghost" disabled={saving} onClick={() => void exportWorkbook()}>
            <FileSpreadsheet size={15} /> Excel
          </button>
          <button className="btn" disabled={saving} onClick={() => void exportPdf()}>
            <Printer size={15} /> {saving ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
        {error && <div className="project-load-warning">{error}</div>}
        {statement.warnings.map((warning) => (
          <div className="project-load-warning" key={warning.kind + warning.message}>
            <strong>{warning.message}</strong>
            {warning.detail ? ` ${warning.detail}` : ''}
          </div>
        ))}
        {!statement.wholeEstimate && (
          <div className="cs-scope-note">
            Part of the estimate only. Seigniorage, NAC, Labour Cess and GST are levied on the
            work as a whole, so they are not apportioned here — the totals below are of the
            work compared.
          </div>
        )}
        <div className="cs-pages" ref={pagesRef}>
          {(pages.abstract.length > 0 ? pages.abstract : [statement.abstractRows]).map(
            (sheet, index, all) => (
              <article className="pp-page cs-page landscape" key={`abstract:${index}`}>
                <header className="cs-page-head">
                  <div>
                    <small>{project.meta.name}</small>
                    <h1>Comparative Statement{index > 0 ? ' — continued' : ''}</h1>
                    <b>
                      {statement.wholeEstimate ? 'General Abstract' : 'Selected work'} ·{' '}
                      {statement.leftYear} compared with {statement.rightYear}
                      {all.length > 1 ? ` · sheet ${index + 1} of ${all.length}` : ''}
                    </b>
                  </div>
                  {index === all.length - 1 && (
                    <div className="cs-page-total">
                      <span>Variation</span>
                      <strong>₹ {money.format(statement.difference)}</strong>
                      <small>{percentCell(statement.percent)}</small>
                    </div>
                  )}
                </header>
                <ComparisonTable
                  rows={sheet}
                  leftYear={statement.leftYear}
                  rightYear={statement.rightYear}
                  showRates={false}
                />
              </article>
            )
          )}

          {(pages.lead.length > 0
            ? pages.lead
            : statement.leadRows.length > 0
              ? [statement.leadRows]
              : []
          ).map((sheet, index, all) => (
            <article className="pp-page cs-page landscape" key={`lead:${index}`}>
              <header className="cs-page-head">
                <div>
                  <small>{project.meta.name}</small>
                  <h1>Lead charges{index > 0 ? ' — continued' : ''}</h1>
                  <b>
                    Conveyance · {statement.leftYear} compared with {statement.rightYear}
                    {all.length > 1 ? ` · sheet ${index + 1} of ${all.length}` : ''}
                  </b>
                </div>
              </header>
              <ComparisonTable
                rows={sheet}
                leftYear={statement.leftYear}
                rightYear={statement.rightYear}
                showRates
              />
              {index === all.length - 1 && (
                <p className="cs-hint">
                  Lead is already inside the item rates on the sheets above; this page shows
                  where part of the movement came from, and is not added again.
                </p>
              )}
            </article>
          ))}

          {statement.components.flatMap((component) => {
            const sheets = pages.components[component.nodeId] ?? [component.rows]
            return sheets.map((sheet, index) => (
              <article
                className="pp-page cs-page landscape"
                key={`${component.nodeId}:${index}`}
              >
                <header className="cs-page-head">
                  <div>
                    <small>{project.meta.name}</small>
                    <h1>{component.name}{index > 0 ? ' — continued' : ''}</h1>
                    <b>
                      Component Abstract · {statement.leftYear} compared with{' '}
                      {statement.rightYear}
                      {sheets.length > 1 ? ` · sheet ${index + 1} of ${sheets.length}` : ''}
                    </b>
                  </div>
                  {index === sheets.length - 1 && (
                    <div className="cs-page-total">
                      <span>Variation</span>
                      <strong>₹ {money.format(component.difference)}</strong>
                      <small>{percentCell(component.percent)}</small>
                    </div>
                  )}
                </header>
                <ComparisonTable
                  rows={sheet}
                  leftYear={statement.leftYear}
                  rightYear={statement.rightYear}
                  showRates
                />
                {/* The total belongs on the sheet the rows end on. */}
                {index === sheets.length - 1 && (
                  <div className="cs-component-total">
                    <span>Component Total</span>
                    <b>{money.format(component.leftTotal)}</b>
                    <b>{money.format(component.rightTotal)}</b>
                    <b className={component.difference > 0 ? 'cs-up' : 'cs-down'}>
                      {money.format(component.difference)}
                    </b>
                    <b>{percentCell(component.percent)}</b>
                  </div>
                )}
              </article>
            ))
          })}
        </div>
      </div>
    )
  }

  if (stage === 'scope') {
    const allChosen = chosen.size === allItemIds.length && allItemIds.length > 0
    return (
      <div className="comparative-statement">
        <div className="cs-toolbar">
          <button className="btn ghost" onClick={onClose}>
            <ArrowLeft size={15} /> Dashboard
          </button>
          <span className="cs-toolbar-title">
            <Scale size={15} /> What do you want to compare?
          </span>
          <button
            className="btn"
            disabled={chosen.size === 0}
            onClick={() => setStage('setup')}
          >
            Choose years <ArrowRight size={15} />
          </button>
        </div>

        <p className="cs-hint">
          Everything is selected to begin with. Clear what this statement is not about — a
          component, a sub-component, or single items within one. Rates are always worked out
          against the whole estimate; this decides what the statement shows and totals.
        </p>

        <div className="cs-scope-actions">
          <button className="btn-mini" onClick={() => toggleItems(allItemIds, true)}>
            Select all
          </button>
          <button className="btn-mini" onClick={() => toggleItems(allItemIds, false)}>
            Clear all
          </button>
          <span className="cs-hint">
            {chosen.size} of {allItemIds.length} item{allItemIds.length === 1 ? '' : 's'} selected
            {allChosen ? ' · the whole estimate' : ''}
          </span>
        </div>

        {hasLead && (
          <label className="cs-scope-row cs-scope-section cs-scope-lead">
            <input
              type="checkbox"
              checked={includeLead}
              onChange={(event) => setIncludeLead(event.target.checked)}
            />
            <span>Lead charges</span>
            <small>
              conveyance, already inside the item rates — shown on its own sheet
            </small>
          </label>
        )}

        <div className="cs-scope-tree">
          {scope.length === 0 && (
            <p className="cs-hint">This estimate has no components to compare yet.</p>
          )}
          {scope.map((entry) => (
            <ScopeBranch
              key={entry.node.id}
              scope={entry}
              depth={0}
              chosen={chosen}
              onToggle={toggleItems}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="comparative-statement">
      <div className="cs-toolbar">
        <button className="btn ghost" onClick={onClose}>
          <ArrowLeft size={15} /> Dashboard
        </button>
        <button className="btn ghost" onClick={() => setStage('scope')}>
          Change scope
        </button>
        <span className="cs-toolbar-title">
          <Scale size={15} /> Comparative Statement
        </span>
        <button
          className="btn"
          disabled={!leftYear || !rightYear || leftYear === rightYear || stage === 'building'}
          onClick={() => void generate()}
        >
          <FileText size={15} />
          {stage === 'building' ? progress || 'Generating…' : 'Generate'}
        </button>
      </div>

      {error && <div className="project-load-warning">{error}</div>}
      {leftYear === rightYear && leftYear !== '' && (
        <div className="project-load-warning">
          Choose two different years — a statement comparing a year with itself has nothing to
          show.
        </div>
      )}

      <div className="cs-setup">
        {(['left', 'right'] as Side[]).map((side) => (
          <section className="cs-side" key={side}>
            <h3>{side === 'left' ? 'Past schedule' : 'New schedule'}</h3>
            <label className="field">
              <span className="field-label">SOR year</span>
              <select
                className="text-input"
                value={side === 'left' ? leftYear : rightYear}
                onChange={(event) =>
                  side === 'left'
                    ? setLeftYear(event.target.value)
                    : setRightYear(event.target.value)
                }
              >
                <option value="">Select a year</option>
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Published circular</span>
              <select
                className="text-input"
                value={circularFrom[side]}
                onChange={(event) =>
                  setCircularFrom((current) => ({ ...current, [side]: event.target.value }))
                }
              >
                <option value="">
                  Rate published for {side === 'left' ? leftYear || 'that year' : rightYear || 'that year'}
                </option>
                {circulars.map((circular) => (
                  <option key={circular.effectiveFrom} value={circular.effectiveFrom}>
                    {formatCircularMonth(circular.effectiveFrom)} ·{' '}
                    {circular.materialCodes.length} materials
                  </option>
                ))}
              </select>
            </label>

            <div className="cs-materials">
              <span className="field-label">Cement / Steel rates</span>
              <p className="cs-hint">
                Leave a box empty and this column prices the material at{' '}
                {circularFrom[side]
                  ? `the ${formatCircularMonth(circularFrom[side])} circular.`
                  : `the rate published for ${
                      side === 'left' ? leftYear || 'that year' : rightYear || 'that year'
                    }.`}{' '}
                Each box shows the figure it will use.
              </p>
              {visibleMaterials.length === 0 && (
                <p className="cs-hint">
                  No cement or steel is used by this estimate&apos;s DATA. Both columns will use
                  each year&apos;s own published rates.
                </p>
              )}
              {visibleMaterials.map((material) => (
                <label className="field" key={material.materialCode}>
                  <span className="field-label">
                    {material.name} <small>({material.unit})</small>
                  </span>
                  {materialInput(side, material.materialCode)}
                </label>
              ))}
              {hiddenMaterialCount > 0 && (
                <label className="cs-show-all">
                  <input
                    type="checkbox"
                    checked={showAllMaterials}
                    onChange={(event) => setShowAllMaterials(event.target.checked)}
                  />
                  Show every published grade ({hiddenMaterialCount} more)
                </label>
              )}
            </div>
          </section>
        ))}
      </div>

      <section className="cs-hand-typed">
        <h3>Rates you typed in DATA</h3>
        {handTyped.length === 0 ? (
          <p className="cs-hint">
            No hand-typed rates in this estimate — every rate is published, so both columns price
            themselves.
          </p>
        ) : (
          <>
            <p className="cs-hint">
              A rate you typed yourself is the one thing a schedule cannot supply. The column
              matching the year you set it under is already filled in; give the other.
            </p>
            <table className="cs-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Resource</th>
                  <th>Unit</th>
                  <th>{leftYear || 'Past'}</th>
                  <th>{rightYear || 'New'}</th>
                </tr>
              </thead>
              <tbody>
                {handTyped.map((rate: HandTypedRate) => (
                  <tr key={rate.key}>
                    <td>{rate.itemLabel}</td>
                    <td className="cs-description">{rate.resourceLabel}</td>
                    <td className="cs-unit">{rate.unit}</td>
                    {(['left', 'right'] as Side[]).map((side) => (
                      <td key={side}>
                        <input
                          className="text-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={answers[side][rate.key] ?? ''}
                          onChange={(event) =>
                            setAnswers((current) => ({
                              ...current,
                              [side]: {
                                ...current[side],
                                [rate.key]: Number(event.target.value)
                              }
                            }))
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  )
}
