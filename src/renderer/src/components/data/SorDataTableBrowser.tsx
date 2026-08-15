import { useEffect, useMemo, useState } from 'react'
import { Database, LoaderCircle, Search, Table2 } from 'lucide-react'
import {
  SOR_CATEGORIES,
  fetchSorRateTableRows,
  type MasterItem,
  type SorRateTableRow
} from '../../lib/masterData'
import {
  SOR_CATALOGUE_CATEGORY,
  fetchSorCataloguePrice,
  fetchSorCatalogues,
  sorCommercialTerms,
  sourceContextTitle,
  visibleSorDimensions,
  type SorCatalogue,
  type SorCataloguePriceMatch
} from '../../lib/sorCatalogue'
import { pipeLeadSourceFromContext } from '../../lib/pipeLead'
import type {
  SorCatalogueDimensionValue,
  SorCatalogueItemSelection,
  SorZone
} from '../../types/project'

type SorTableSelection =
  | { kind: 'basic'; categoryKey: string }
  | { kind: 'catalogue'; catalogue: SorCatalogue }

interface CatalogueMatrixRow {
  key: string
  label: string
  unit: string
  cells: Map<string, SorCataloguePriceMatch>
}

interface CatalogueMatrix {
  key: string
  label: string
  sourcePage: number | null
  columnKey: string
  columns: string[]
  rows: CatalogueMatrixRow[]
}

interface CatalogueMatrices {
  matrices: CatalogueMatrix[]
  ungroupedRows: SorCataloguePriceMatch[]
}

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export default function SorDataTableBrowser({
  sorYear,
  zone,
  onInspect
}: {
  sorYear: string
  zone: SorZone
  onInspect: (item: MasterItem) => void
}): JSX.Element {
  const [selection, setSelection] = useState<SorTableSelection>({ kind: 'basic', categoryKey: 'material' })
  const [catalogues, setCatalogues] = useState<SorCatalogue[]>([])
  const [cataloguesLoading, setCataloguesLoading] = useState(true)
  const [catalogueError, setCatalogueError] = useState('')
  const [catalogueSearch, setCatalogueSearch] = useState('')

  useEffect(() => {
    let active = true
    void fetchSorCatalogues()
      .then((rows) => {
        if (active) setCatalogues(rows)
      })
      .catch((error: unknown) => {
        if (active) setCatalogueError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (active) setCataloguesLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const filteredCatalogues = useMemo(() => {
    const query = catalogueSearch.trim().toLocaleLowerCase()
    if (!query) return catalogues
    return catalogues.filter((catalogue) =>
      [catalogue.name, catalogue.catalogue_code, catalogue.part, catalogue.section]
        .some((value) => value.toLocaleLowerCase().includes(query))
    )
  }, [catalogueSearch, catalogues])

  return (
    <section className="sor-data-table-browser">
      <aside className="sor-data-table-nav">
        <div className="sor-data-table-nav-heading">
          <Database size={17} />
          <div>
            <strong>SOR rate tables</strong>
            <span>{sorYear} · choose a table</span>
          </div>
        </div>

        <div className="sor-data-table-nav-section">
          <span className="sor-data-table-nav-label">Basic SOR tables</span>
          {SOR_CATEGORIES.map((category) => (
            <button
              type="button"
              key={category.key}
              className={selection.kind === 'basic' && selection.categoryKey === category.key ? 'active' : ''}
              onClick={() => setSelection({ kind: 'basic', categoryKey: category.key })}
            >
              <Table2 size={14} />
              {category.label}
            </button>
          ))}
        </div>

        <div className="sor-data-table-nav-section sor-data-table-catalogues">
          <span className="sor-data-table-nav-label">Published complex tables</span>
          <label className="sor-data-table-nav-search">
            <Search size={13} />
            <input
              value={catalogueSearch}
              placeholder="Find pipes, scaffolding…"
              onChange={(event) => setCatalogueSearch(event.target.value)}
            />
          </label>
          <div className="sor-data-table-catalogue-list">
            {cataloguesLoading ? (
              <div className="sor-data-table-state"><LoaderCircle className="spin" size={15} /> Loading tables…</div>
            ) : catalogueError ? (
              <div className="sor-data-table-state error">Could not load published tables: {catalogueError}</div>
            ) : filteredCatalogues.length === 0 ? (
              <div className="sor-data-table-state">No published table matches.</div>
            ) : (
              filteredCatalogues.map((catalogue) => (
                <button
                  type="button"
                  key={catalogue.catalogue_code}
                  className={selection.kind === 'catalogue' && selection.catalogue.catalogue_code === catalogue.catalogue_code ? 'active' : ''}
                  onClick={() => setSelection({ kind: 'catalogue', catalogue })}
                  title={`${catalogue.part} · ${catalogue.section}`}
                >
                  <strong>{catalogue.name}</strong>
                  <small>{catalogue.part.replace(/^PART_/i, 'Part ').replace(/_/g, ' ')}</small>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      <main className="sor-data-table-main">
        {selection.kind === 'basic' ? (
          <BasicSorRateTable
            categoryKey={selection.categoryKey}
            sorYear={sorYear}
            zone={zone}
            onInspect={onInspect}
          />
        ) : (
          <PublishedSorCatalogueTable
            catalogue={selection.catalogue}
            sorYear={sorYear}
            onInspect={onInspect}
          />
        )}
      </main>
    </section>
  )
}

function BasicSorRateTable({
  categoryKey,
  sorYear,
  zone,
  onInspect
}: {
  categoryKey: string
  sorYear: string
  zone: SorZone
  onInspect: (item: MasterItem) => void
}): JSX.Element {
  const category = SOR_CATEGORIES.find((candidate) => candidate.key === categoryKey)
  const [rows, setRows] = useState<SorRateTableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void fetchSorRateTableRows(categoryKey, sorYear, zone)
      .then((next) => {
        if (active) setRows(next)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [categoryKey, sorYear, zone])

  const visible = useMemo(() => filterBasicRows(rows, search), [rows, search])
  const machinery = categoryKey === 'machinery'

  return (
    <section className="sor-data-table-view">
      <header className="sor-data-table-view-heading">
        <div>
          <span>Basic SOR table · {sorYear}</span>
          <strong>{category?.label ?? 'SOR'} rates</strong>
        </div>
        <TableSearch value={search} onChange={setSearch} placeholder={`Search this ${category?.label.toLocaleLowerCase() ?? 'SOR'} table`} />
      </header>
      {loading ? (
        <TableState label={`Loading the full ${category?.label ?? 'SOR'} table…`} />
      ) : error ? (
        <div className="sor-data-table-error">Could not load this SOR table: {error}</div>
      ) : (
        <div className="sor-data-table-scroll">
          <table className="sor-data-rate-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Particulars</th>
                <th>Unit</th>
                {machinery ? <th>Hire</th> : null}
                {machinery ? <th>Fuel</th> : null}
                {machinery ? <th>Crew</th> : null}
                <th>{machinery ? 'Total / hour' : 'Rate'}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.code} onClick={() => onInspect(row)} title="Open this read-only DATA">
                  <td><code>{row.code}</code></td>
                  <td>{row.description}</td>
                  <td>{row.unit || '—'}</td>
                  {machinery ? <td>{rateText(row.hireCharge)}</td> : null}
                  {machinery ? <td>{rateText(row.fuelCharge)}</td> : null}
                  {machinery ? <td>{rateText(row.crewCharge)}</td> : null}
                  <td className="amount">{rateText(row.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length ? <div className="sor-data-table-state">No rate row matches “{search}”.</div> : null}
        </div>
      )}
      {!loading && !error ? <footer>{visible.length.toLocaleString('en-IN')} of {rows.length.toLocaleString('en-IN')} published rows · click a row to open its read-only DATA</footer> : null}
    </section>
  )
}

function PublishedSorCatalogueTable({
  catalogue,
  sorYear,
  onInspect
}: {
  catalogue: SorCatalogue
  sorYear: string
  onInspect: (item: MasterItem) => void
}): JSX.Element {
  const [rows, setRows] = useState<SorCataloguePriceMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void fetchSorCataloguePrice(catalogue.catalogue_code, sorYear, {})
      .then((next) => {
        if (active) setRows(next)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [catalogue.catalogue_code, sorYear])

  const visible = useMemo(() => filterCatalogueRows(rows, search), [rows, search])
  const matrices = useMemo(() => buildCatalogueMatrices(visible), [visible])

  return (
    <section className="sor-data-table-view">
      <header className="sor-data-table-view-heading">
        <div>
          <span>{catalogue.part.replace(/^PART_/i, 'Part ').replace(/_/g, ' ')} · {catalogue.section}</span>
          <strong>{catalogue.name}</strong>
        </div>
        <TableSearch value={search} onChange={setSearch} placeholder="Search this complete published table" />
      </header>
      {loading ? (
        <TableState label={`Reconstructing the complete ${catalogue.name} table…`} />
      ) : error ? (
        <div className="sor-data-table-error">Could not load this published SOR table: {error}</div>
      ) : matrices.matrices.length ? (
        <CatalogueMatrixTables
          matrices={matrices.matrices}
          ungroupedRows={matrices.ungroupedRows}
          catalogue={catalogue}
          sorYear={sorYear}
          onInspect={onInspect}
        />
      ) : (
        <CatalogueFlatTable rows={visible} catalogue={catalogue} sorYear={sorYear} onInspect={onInspect} />
      )}
      {!loading && !error ? <footer>{visible.length.toLocaleString('en-IN')} of {rows.length.toLocaleString('en-IN')} published cells · click a rate to open its read-only DATA</footer> : null}
    </section>
  )
}

function CatalogueMatrixTables({
  matrices,
  ungroupedRows,
  catalogue,
  sorYear,
  onInspect
}: {
  matrices: CatalogueMatrix[]
  ungroupedRows: SorCataloguePriceMatch[]
  catalogue: SorCatalogue
  sorYear: string
  onInspect: (item: MasterItem) => void
}): JSX.Element {
  return (
    <div className="sor-data-table-scroll sor-data-matrix-scroll">
      <div className="sor-data-matrix-list">
        {matrices.map((matrix) => (
          <section className="sor-data-matrix-section" key={matrix.key}>
            <header>
              <div>
                <strong>{matrix.label}</strong>
                <small>{matrix.rows.length} × {matrix.columns.length} rate matrix{matrix.sourcePage ? ` · published page ${matrix.sourcePage}` : ''}</small>
              </div>
            </header>
            <table className="sor-data-rate-table sor-data-complex-matrix">
              <thead>
                <tr>
                  <th>Item / particulars</th>
                  {matrix.columns.map((column) => <th key={column}>{formatDimension(matrix.columnKey, column)}</th>)}
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    {matrix.columns.map((column) => {
                      const match = row.cells.get(column)
                      return (
                        <td key={column} className="amount">
                          {match ? (
                            <button type="button" onClick={() => onInspect(catalogueMasterItem(catalogue, match, sorYear))}>
                              {matchRateText(match)}
                            </button>
                          ) : '—'}
                        </td>
                      )
                    })}
                    <td>{row.unit || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        {ungroupedRows.length ? (
          <section className="sor-data-matrix-section sor-data-matrix-flat-section">
            <header>
              <div>
                <strong>Other published rows</strong>
                <small>Rows which do not belong to a source matrix</small>
              </div>
            </header>
            <CatalogueFlatTable rows={ungroupedRows} catalogue={catalogue} sorYear={sorYear} onInspect={onInspect} embedded />
          </section>
        ) : null}
      </div>
    </div>
  )
}

function CatalogueFlatTable({
  rows,
  catalogue,
  sorYear,
  onInspect,
  embedded = false
}: {
  rows: SorCataloguePriceMatch[]
  catalogue: SorCatalogue
  sorYear: string
  onInspect: (item: MasterItem) => void
  embedded?: boolean
}): JSX.Element {
  const table = (
    <>
      <table className="sor-data-rate-table sor-data-complex-flat">
        <thead>
          <tr>
            <th>Item / particulars</th>
            <th>Published specifications</th>
            <th>Unit</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.item_code} onClick={() => onInspect(catalogueMasterItem(catalogue, row, sorYear))} title="Open this read-only DATA">
              <td>{row.item_name || catalogue.name}</td>
              <td>{dimensionText(row.dimensions)}</td>
              <td>{row.unit || '—'}</td>
              <td className="amount">{matchRateText(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? <div className="sor-data-table-state">No published cell matches the table search.</div> : null}
    </>
  )
  return embedded ? table : <div className="sor-data-table-scroll">{table}</div>
}

function TableSearch({
  value,
  onChange,
  placeholder
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}): JSX.Element {
  return (
    <label className="sor-data-table-search">
      <Search size={15} />
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function TableState({ label }: { label: string }): JSX.Element {
  return <div className="sor-data-table-state"><LoaderCircle className="spin" size={18} /> {label}</div>
}

function filterBasicRows(rows: SorRateTableRow[], search: string): SorRateTableRow[] {
  const query = search.trim().toLocaleLowerCase()
  if (!query) return rows
  return rows.filter((row) => `${row.code} ${row.description} ${row.unit ?? ''}`.toLocaleLowerCase().includes(query))
}

function filterCatalogueRows(rows: SorCataloguePriceMatch[], search: string): SorCataloguePriceMatch[] {
  const query = search.trim().toLocaleLowerCase()
  if (!query) return rows
  return rows.filter((row) =>
    `${row.item_code} ${row.item_name} ${row.unit ?? ''} ${dimensionText(row.dimensions)}`
      .toLocaleLowerCase()
      .includes(query)
  )
}

function buildCatalogueMatrices(rows: SorCataloguePriceMatch[]): CatalogueMatrices {
  const sourceGroups = new Map<string, SorCataloguePriceMatch[]>()
  for (const row of rows) {
    const key = sourceMatrixKey(row)
    const group = sourceGroups.get(key) ?? []
    group.push(row)
    sourceGroups.set(key, group)
  }

  const matrices: CatalogueMatrix[] = []
  const ungroupedRows: SorCataloguePriceMatch[] = []
  for (const [key, group] of sourceGroups) {
    const matrix = buildSourceMatrix(key, group)
    if (matrix) matrices.push(matrix)
    else ungroupedRows.push(...group)
  }
  return { matrices, ungroupedRows }
}

function buildSourceMatrix(key: string, rows: SorCataloguePriceMatch[]): CatalogueMatrix | null {
  if (!rows.length) return null
  const columnKey = ['column_label', 'pipe_class', 'rate_component'].find((candidate) =>
    new Set(rows.map((row) => String(row.dimensions[candidate] ?? '')).filter(Boolean)).size >= 2
  )
  if (!columnKey) return null

  const columns: string[] = []
  const grouped = new Map<string, CatalogueMatrixRow>()
  for (const match of rows) {
    const rowLabel = String(match.dimensions.row_label ?? match.item_name ?? '').trim()
    const column = String(match.dimensions[columnKey] ?? '').trim()
    if (!rowLabel || !column) return null
    if (!columns.includes(column)) columns.push(column)

    const unit = match.unit ?? ''
    const rowKey = `${rowLabel}|${unit}`
    const current = grouped.get(rowKey) ?? { key: rowKey, label: rowLabel, unit, cells: new Map<string, SorCataloguePriceMatch>() }
    if (current.cells.has(column)) return null
    current.cells.set(column, match)
    grouped.set(rowKey, current)
  }

  if (grouped.size < 2 || columns.length < 2) return null
  return {
    key,
    label: sourceMatrixLabel(rows[0]),
    sourcePage: rows[0].source_page,
    columnKey,
    columns,
    rows: Array.from(grouped.values())
  }
}

function sourceMatrixKey(row: SorCataloguePriceMatch): string {
  const context = row.source_context
  return JSON.stringify({
    page: row.source_page,
    title: context.title ?? '',
    context: context.context ?? [],
    headers: context.headers ?? []
  })
}

function sourceMatrixLabel(row: SorCataloguePriceMatch): string {
  const context = row.source_context.context
  if (Array.isArray(context)) {
    const text = context.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).join(' · ')
    if (text) return text
  }
  return 'Published source table'
}

function catalogueMasterItem(
  catalogue: SorCatalogue,
  match: SorCataloguePriceMatch,
  sorYear: string
): MasterItem {
  const pipeLead = pipeLeadSourceFromContext(match.source_context, match.item_code)
  const selection: SorCatalogueItemSelection = {
    catalogueCode: catalogue.catalogue_code,
    catalogueName: catalogue.name,
    part: catalogue.part,
    section: catalogue.section,
    dimensions: visibleSorDimensions(match.dimensions),
    selectedYear: sorYear,
    publishedRate: match.rate,
    rateText: match.rate_text.trim() || null,
    effectiveFrom: match.effective_from,
    source: match.source,
    sourcePage: match.source_page,
    sourceTitle: sourceContextTitle(match.source_context),
    commercialTerms: sorCommercialTerms(match.source_context),
    ...(pipeLead ? { pipeLead } : {})
  }
  return {
    side: 'SOR',
    category: SOR_CATALOGUE_CATEGORY,
    code: match.item_code,
    description: match.item_name || catalogue.name,
    unit: match.unit,
    sorCatalogue: selection
  }
}

function dimensionText(dimensions: Record<string, SorCatalogueDimensionValue>): string {
  return Object.entries(visibleSorDimensions(dimensions))
    .map(([key, value]) => `${dimensionLabel(key)}: ${formatDimension(key, String(value ?? ''))}`)
    .join(' · ')
}

function dimensionLabel(key: string): string {
  const labels: Record<string, string> = {
    row_label: 'Row',
    column_label: 'Column',
    pipe_class: 'Pipe class',
    diameter_mm: 'Diameter',
    rate_component: 'Rate component',
    floor: 'Floor',
    pressure: 'Pressure'
  }
  return labels[key] ?? key.replace(/_/g, ' ')
}

function formatDimension(key: string, value: string): string {
  if (key.endsWith('_mm') && Number.isFinite(Number(value))) return `${Number(value).toLocaleString('en-IN')} mm`
  if (key === 'floor') return `Floor ${value}`
  return value
}

function rateText(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `₹ ${money.format(value)}`
}

function matchRateText(match: SorCataloguePriceMatch): string {
  return match.rate === null ? match.rate_text || 'Reference' : `₹ ${money.format(match.rate)}`
}
