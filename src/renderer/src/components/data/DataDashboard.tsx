import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Database,
  FilePenLine,
  Eye,
  LayoutDashboard,
  Plus,
  Printer,
  RefreshCw,
  Search
} from 'lucide-react'
import {
  dashboardContextMatches,
  dashboardDataCompileSignature,
  syncDataDashboardSnapshot
} from '../../lib/dashboardSync'
import { collectDataSheets } from '../../lib/dataSheets'
import { buildDataSheetsPrintPdf } from '../../lib/dataSheetPrint'
import { PRINT_REBUILD_DELAY_MS } from '../../lib/componentPrint'
import type { MasterItem } from '../../lib/masterData'
import { resolveProjectPrintSettings } from '../../lib/projectPrintSettings'
import { projectDataRate } from '../../lib/projectData'
import { calculateRateAnalysis, fetchRateAnalysis } from '../../lib/rateAnalysis'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../store/useStore'
import type {
  CompiledDataDashboardEntry,
  CompiledDataScope,
  EestimateProject,
  ProjectDataDefinition,
  ProjectNode
} from '../../types/project'
import type {
  RateAnalysisFigure,
  RateAnalysisRecipe,
  RateAnalysisSectionKey,
  RateAnalysisStoredRow
} from '../../types/rateAnalysis'
import { SsrCodeSelectionColumn } from '../modals/AddItemModal'
import SignatureFooterCard from '../signature/SignatureFooterCard'
import { DATA_SIGNATURE_SCOPE } from '../../lib/signatureFooter'
import PdfPageStack from '../print/PdfPageStack'
import CreateProjectDataModal from './CreateProjectDataModal'
import MaterialRatesPanel from './MaterialRatesPanel'
import SorDataTableBrowser from './SorDataTableBrowser'

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

function entryDisplayName(entry: CompiledDataDashboardEntry): string {
  return entry.source === 'SOR' || entry.source === 'PROJECT_DATA'
    ? entry.description
    : entry.displayName
}

export default function DataDashboard(): JSX.Element | null {
  const project = useStore((state) => state.project)
  const setDashboardSnapshot = useStore((state) => state.setDashboardSnapshot)
  const openRateAnalysis = useStore((state) => state.openRateAnalysis)
  const dataDashboardSection = useStore((state) => state.dataDashboardSection)
  const setDataDashboardSection = useStore((state) => state.setDataDashboardSection)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [printView, setPrintView] = useState(false)
  const [printPreview, setPrintPreview] = useState(false)
  const [printPdfUrl, setPrintPdfUrl] = useState<string | null>(null)
  const [createDataOpen, setCreateDataOpen] = useState(false)
  const [editingData, setEditingData] = useState<ProjectDataDefinition | null>(null)
  const [creationNotice, setCreationNotice] = useState('')
  const printFrameRef = useRef<HTMLIFrameElement>(null)

  const snapshotValid = project
    ? dashboardContextMatches(project.dashboardSnapshot, project)
    : false
  const entries = snapshotValid
    ? project?.dashboardSnapshot?.dataDashboardEntries ?? []
    : []
  // Walks the whole item tree and stringifies it, so it must not run on every
  // render — filter keystrokes and print toggles do not change the signature.
  const currentSignature = useMemo(
    () => (project ? dashboardDataCompileSignature(project) : ''),
    [project]
  )
  const compiled =
    snapshotValid &&
    Boolean(project?.dashboardSnapshot?.dataSyncedAt) &&
    project?.dashboardSnapshot?.dataCompileSignature === currentSignature
  const visibleEntries = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return entries
    return entries.filter((entry) =>
      [
        entry.source === 'SOR' ? null : entry.code,
        entryDisplayName(entry),
        entry.description,
        entry.scopeName,
        ...entry.usages.map((usage) => usage.path)
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query))
    )
  }, [entries, filter])

  if (!project) return null

  const projectData = project.projectData ?? []
  const isDashboard = dataDashboardSection === 'dashboard'

  const syncDashboard = async (): Promise<void> => {
    if (syncing) return
    setSyncing(true)
    setError('')
    try {
      const next = await syncDataDashboardSnapshot(project)
      if (useStore.getState().project?.id === project.id) setDashboardSnapshot(next)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to sync the DATA Dashboard.')
    } finally {
      setSyncing(false)
    }
  }

  const report = (
    <DataDashboardReport
      project={project}
      entries={entries}
      fontScale={resolveProjectPrintSettings(project.projectPrintSettings).fontPercent / 100}
      onPdfReady={setPrintPdfUrl}
    />
  )

  return (
    <div
      className={`dashboard aggregate-dashboard data-total-dashboard ${
        dataDashboardSection === 'catalogue' ? 'data-catalogue-dashboard' : ''
      } ${
        printView ? 'dashboard-print-view' : ''
      }`}
    >
      <div className="dash-header">
        <div>
          <div className="dash-eyebrow">
            {isDashboard
              ? 'Total dashboard'
              : dataDashboardSection === 'created'
                ? 'Project DATA library'
                : 'Published backend catalogue'}
          </div>
          <h1 className="dash-title">
            {isDashboard ? <Database size={22} /> : dataDashboardSection === 'created' ? <FilePenLine size={22} /> : <BookOpen size={22} />}
            {isDashboard
              ? 'DATA Dashboard'
              : dataDashboardSection === 'created'
                ? 'Created DATA'
                : 'SOR / SSR DATA'}
          </h1>
          {isDashboard ? (
            <div className="aggregate-meta">
              <span>{entries.length} compiled DATA row(s)</span>
              <span>{entries.filter((entry) => entry.scope !== 'shared').length} edited row(s)</span>
              {project.dashboardSnapshot?.dataSyncedAt && (
                <span>
                  Synced {new Date(project.dashboardSnapshot.dataSyncedAt).toLocaleString()}
                </span>
              )}
            </div>
          ) : dataDashboardSection === 'created' ? (
            <div className="aggregate-meta">
              <span>{projectData.length} project-created DATA definition(s)</span>
              <span>Editable in this project</span>
            </div>
          ) : (
            <div className="aggregate-meta">
              <span>Official SOR and SSR source DATA</span>
              <span>Read-only</span>
            </div>
          )}
        </div>
        <div className="dash-actions">
          {dataDashboardSection !== 'catalogue' && (
            <button className="btn" onClick={() => setCreateDataOpen(true)}>
              <Plus size={15} /> Create New DATA
            </button>
          )}
          {isDashboard && (
            <>
              <button className="btn ghost" disabled={syncing} onClick={() => void syncDashboard()}>
                <RefreshCw size={15} /> {syncing ? 'Recompiling…' : 'Sync'}
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  setPrintView(false)
                  setPrintPreview(true)
                }}
              >
                <Printer size={15} /> Print Preview
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  setPrintPreview(false)
                  setPrintView((value) => !value)
                }}
              >
                {printView ? <LayoutDashboard size={15} /> : <Eye size={15} />}
                {printView ? 'Dashboard View' : 'View Print View'}
              </button>
            </>
          )}
        </div>
      </div>

      {creationNotice && <div className="rate-notice">{creationNotice}</div>}
      {isDashboard && (
        <>
          {error && <div className="rate-warning">DATA sync failed: {error}</div>}
          {!compiled && !error && (
            <div className="rate-notice">
              {entries.length
                ? 'Items, edits, or Lead additions have changed. Click Sync to recompile all DATA rates.'
                : 'Click Sync to compile all DATA items, descriptions, scoped edits, and rates.'}
            </div>
          )}
          {printView ? (
            report
          ) : (
            <>
        <SignatureFooterCard scopeKey={DATA_SIGNATURE_SCOPE} />
        <section className="aggregate-panel">
          <label className="aggregate-search">
            <Search size={14} />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter code, description, edit scope, or component…"
            />
          </label>
          <div className="aggregate-table data-aggregate-table">
            <div className="aggregate-table-head">
              <span>DATA item</span>
              <span>Description</span>
              <span>Applied at</span>
              <span>Rate</span>
              <span></span>
            </div>
            {visibleEntries.length === 0 ? (
              <div className="aggregate-empty">No compiled DATA rows found.</div>
            ) : (
              visibleEntries.map((entry) => (
                <div className="aggregate-table-row" key={entry.key}>
                  <span className="aggregate-primary">
                    <strong>{entryDisplayName(entry)}</strong>
                    <small className={`data-scope-badge ${entry.scope}`}>
                      {scopeLabel(entry.scope, entry.scopeName)}
                    </small>
                  </span>
                  <span>{entry.description}</span>
                  <span className="aggregate-usage-list">
                    {entry.usages.map((usage) => (
                      <small key={usage.nodeId}>{usage.path}</small>
                    ))}
                  </span>
                  <span className="aggregate-rate">
                    {entry.rate === null
                      ? 'Rate unavailable'
                      : `₹ ${money.format(entry.rate)}${entry.unit ? ` / ${entry.unit}` : ''}`}
                    {entry.leadRate > 0 && (
                      <small>
                        Base ₹ {money.format(entry.baseRate ?? 0)} + Lead ₹{' '}
                        {money.format(entry.leadRate)}
                      </small>
                    )}
                  </span>
                  <span>
                    <button
                      className="btn-mini"
                      onClick={() =>
                        openRateAnalysis(
                          entry.baseKey,
                          entry.representativeNodeId,
                          false,
                          entry.scopeNodeId
                        )
                      }
                    >
                      Open
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
            </>
          )}

          {printPreview && (
        <div className="aggregate-print-overlay" role="dialog" aria-modal="true">
          <div className="aggregate-print-shell">
            <div className="aggregate-print-toolbar">
              <strong>DATA Dashboard Print Preview</strong>
              <div>
                <button
                  className="btn ghost"
                  disabled={!printPdfUrl}
                  onClick={() => printFrameRef.current?.contentWindow?.print()}
                >
                  <Printer size={14} /> Print
                </button>
                <button className="btn ghost" onClick={() => setPrintPreview(false)}>
                  Close
                </button>
              </div>
            </div>
            {report}
            {printPdfUrl && (
              <iframe
                ref={printFrameRef}
                className="data-dashboard-print-source"
                title="DATA Dashboard PDF"
                src={printPdfUrl}
              />
            )}
          </div>
        </div>
          )}
        </>
      )}
      {dataDashboardSection === 'created' && (
        <CreatedDataLibrary
          definitions={projectData}
          onCreate={() => setCreateDataOpen(true)}
          onEdit={setEditingData}
        />
      )}
      {dataDashboardSection === 'catalogue' && (
        <BackendDataLibrary project={project} />
      )}
      {dataDashboardSection === 'rates' && <MaterialRatesPanel />}
      {(createDataOpen || editingData) && (
        <CreateProjectDataModal
          editingDefinition={editingData ?? undefined}
          onClose={() => {
            setCreateDataOpen(false)
            setEditingData(null)
          }}
          onSaved={(definition) => {
            setCreateDataOpen(false)
            setEditingData(null)
            setDataDashboardSection('created')
            setCreationNotice(
              `${definition.code} ${editingData ? 'updated' : 'created'}. Add it from a Component or Sub-component: Add Item → Project DATA.`
            )
          }}
        />
      )}
    </div>
  )
}

function CreatedDataLibrary({
  definitions,
  onCreate,
  onEdit
}: {
  definitions: ProjectDataDefinition[]
  onCreate: () => void
  onEdit: (definition: ProjectDataDefinition) => void
}): JSX.Element {
  return (
    <section className="created-data-library">
      <div className="created-data-library-intro">
        <div>
          <strong>Your created DATA</strong>
          <p>
            These definitions are editable. Creating DATA here does not add an Item to the
            estimate; add it later through <b>Add Item → Project DATA</b>.
          </p>
        </div>
        <button className="btn" onClick={onCreate}>
          <Plus size={15} /> Create New DATA
        </button>
      </div>
      {definitions.length === 0 ? (
        <div className="created-data-empty">
          <FilePenLine size={24} />
          <strong>No project DATA has been created yet.</strong>
          <span>Create an SOR or SSR DATA definition to keep it in this project library.</span>
        </div>
      ) : (
        <div className="created-data-list">
          {definitions.map((definition) => (
            <article className="created-data-card" key={definition.id}>
              <div className="created-data-card-heading">
                <span className={`created-data-kind ${definition.kind}`}>{definition.kind.toUpperCase()}</span>
                <strong>{definition.code}</strong>
                <small>{definition.unit}</small>
              </div>
              <p>{definition.description}</p>
              <div className="created-data-card-footer">
                <span>
                  Rate <b>₹ {money.format(projectDataRate(definition))}</b> / {definition.unit}
                </span>
                <button className="btn-mini" onClick={() => onEdit(definition)}>
                  Edit
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function BackendDataLibrary({ project }: { project: EestimateProject }): JSX.Element {
  const [source, setSource] = useState<'SSR' | 'SOR'>('SSR')
  const [sorDetailOpen, setSorDetailOpen] = useState(false)
  const [selected, setSelected] = useState<MasterItem | null>(null)
  const [recipe, setRecipe] = useState<RateAnalysisRecipe | null>(null)
  const [loadingCode, setLoadingCode] = useState('')
  const [error, setError] = useState('')
  const requestRef = useRef(0)

  const showBackendData = async (item: MasterItem): Promise<void> => {
    const request = requestRef.current + 1
    requestRef.current = request
    setSelected(item)
    setRecipe(null)
    setError('')
    setLoadingCode(item.code)
    try {
      const next = await fetchRateAnalysis(backendDataNode(item), project.meta.sorYear, {
        zone: project.meta.sorZone ?? 'zone_3',
        materialRateOverrides: project.meta.materialRateOverrides
      })
      if (request === requestRef.current) setRecipe(next)
    } catch (reason: unknown) {
      if (request === requestRef.current) {
        setError(reason instanceof Error ? reason.message : 'Unable to load this backend DATA.')
      }
    } finally {
      if (request === requestRef.current) setLoadingCode('')
    }
  }

  const openSorData = (item: MasterItem): void => {
    setSorDetailOpen(true)
    void showBackendData(item)
  }

  const detail = !selected ? (
    <div className="backend-data-placeholder">
      <BookOpen size={28} />
      <strong>Select a SOR or SSR code</strong>
      <span>Its official source DATA and detailed rate analysis will appear here.</span>
    </div>
  ) : loadingCode ? (
    <div className="backend-data-placeholder">
      <RefreshCw className="spin" size={25} />
      <strong>Loading {loadingCode}…</strong>
      <span>Getting the published backend DATA.</span>
    </div>
  ) : error ? (
    <div className="rate-warning">Unable to load {selected.code}: {error}</div>
  ) : recipe ? (
    <BackendDataPreview recipe={recipe} source={selected.side} />
  ) : null

  return (
    <section className="backend-data-library">
      <div className="backend-data-library-tabs" role="tablist" aria-label="Published DATA source">
        <button
          type="button"
          role="tab"
          aria-selected={source === 'SSR'}
          className={source === 'SSR' ? 'active' : ''}
          onClick={() => setSource('SSR')}
        >
          SSR DATA
          <small>AI code search</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={source === 'SOR'}
          className={source === 'SOR' ? 'active' : ''}
          onClick={() => {
            setSource('SOR')
            setSorDetailOpen(false)
          }}
        >
          SOR DATA
          <small>Published rate tables</small>
        </button>
      </div>

      {source === 'SOR' && !sorDetailOpen ? (
        <SorDataTableBrowser
          sorYear={project.meta.sorYear}
          zone={project.meta.sorZone ?? 'zone_3'}
          onInspect={openSorData}
        />
      ) : source === 'SOR' ? (
        <section className="backend-data-browser backend-data-browser-full-detail">
          <main className="backend-data-detail">
            <div className="backend-data-detail-backbar">
              <button type="button" className="btn ghost compact" onClick={() => setSorDetailOpen(false)}>
                <ArrowLeft size={15} /> Back to SOR table
              </button>
              {selected ? <span>{selected.description}</span> : null}
            </div>
            {detail}
          </main>
        </section>
      ) : (
        <section className="backend-data-browser">
          <aside className="backend-data-picker">
            <div className="backend-data-picker-heading">
              <strong>Find published SSR DATA</strong>
              <span>Use the same code, category, and AI search used by Add Item.</span>
            </div>
            <SsrCodeSelectionColumn onPick={(item) => void showBackendData(item)} />
          </aside>
          <main className="backend-data-detail">
            {detail}
          </main>
        </section>
      )}
    </section>
  )
}

const BACKEND_SECTION_LABELS: Record<RateAnalysisSectionKey, string> = {
  materials: 'Materials',
  machinery: 'Machinery',
  labour: 'Labour'
}

function BackendDataPreview({
  recipe,
  source
}: {
  recipe: RateAnalysisRecipe
  source: 'SOR' | 'SSR'
}): JSX.Element {
  const summary = calculateRateAnalysis(recipe)
  const publishedRate = typeof recipe.publishedRate === 'number'
    ? recipe.publishedRate
    : summary.ratePerUnit
  const sections = recipe.sections.filter((section) => section.lines.length > 0)
  const resourceCount = sections.reduce((count, section) => count + section.lines.length, 0)
  const abstractRows = publishedAbstractRows(recipe, summary)

  return (
    <article className="backend-data-preview">
      <header className="backend-data-preview-header">
        <div className="backend-data-preview-identity">
          <span className={`backend-data-source-badge ${source.toLowerCase()}`}>{source} DATA</span>
          <strong>{recipe.itemCode}</strong>
          <small>Published backend source · Read-only</small>
        </div>
        <div className="backend-data-preview-rate">
          <small>Published rate</small>
          <strong>₹ {money.format(publishedRate)}</strong>
          <span>per {recipe.unit || 'unit'}</span>
        </div>
      </header>

      {recipe.sectionHeading?.trim() ? (
        <div className="backend-data-preview-section-heading">
          <span>SSR section</span>
          <strong>{recipe.sectionHeading}</strong>
        </div>
      ) : null}
      <p className="backend-data-preview-description">{recipe.description}</p>

      <BackendSourceFigures figures={recipe.sourceFigures ?? []} itemCode={recipe.itemCode} />

      <div className="backend-data-preview-metrics">
        <div>
          <span>Output</span>
          <strong>{formatQuantity(recipe.outputQuantity)} {recipe.unit || 'unit'}</strong>
        </div>
        <div>
          <span>Total cost</span>
          <strong>₹ {money.format(summary.totalCost)}</strong>
        </div>
        <div>
          <span>Materials</span>
          <strong>₹ {money.format(summary.sectionTotals.materials)}</strong>
        </div>
        <div>
          <span>Machinery</span>
          <strong>₹ {money.format(summary.sectionTotals.machinery)}</strong>
        </div>
        <div>
          <span>Labour</span>
          <strong>₹ {money.format(summary.sectionTotals.labour)}</strong>
        </div>
      </div>

      <section className="backend-data-abstract">
        <header>
          <div>
            <strong>Rate Abstract</strong>
            <small>Published calculation summary</small>
          </div>
          <span>{abstractRows.length} entries</span>
        </header>
        <div className="backend-data-abstract-row backend-data-abstract-row-head">
          <span>Particulars</span>
          <span>Value</span>
          <span>Basis / %</span>
          <span>Amount</span>
        </div>
        {abstractRows.map((row, index) => (
          <div className="backend-data-abstract-row" key={`${row.label}-${index}`}>
            <span>{row.label || '—'}</span>
            <span>{row.value || '—'}</span>
            <span>{abstractRowBasis(row) || '—'}</span>
            <strong>{abstractRowAmount(row)}</strong>
          </div>
        ))}
      </section>

      <details className="backend-data-details" open>
        <summary>
          <span>Detailed rate analysis</span>
          <small>{resourceCount} published resource line{resourceCount === 1 ? '' : 's'}</small>
        </summary>
        <div className="backend-data-preview-sections">
          {sections.length === 0 ? (
            <div className="backend-data-preview-empty">No detailed resource lines are published for this DATA.</div>
          ) : (
            sections.map((section) => (
              <section className={`backend-data-preview-section ${section.key}`} key={section.key}>
                <header>
                  <span>{BACKEND_SECTION_LABELS[section.key]}</span>
                  <strong>₹ {money.format(summary.sectionTotals[section.key])}</strong>
                </header>
                <div className="backend-data-preview-row backend-data-preview-row-head">
                  <span>Resource</span>
                  <span>Unit</span>
                  <span>Qty</span>
                  <span>Rate</span>
                  <span>Amount</span>
                </div>
                {section.lines.map((line) => (
                  <div className="backend-data-preview-row" key={line.id}>
                    <span title={line.description}>{line.description}</span>
                    <span>{line.unit || '—'}</span>
                    <span>{formatQuantity(line.quantity)}</span>
                    <span>₹ {money.format(line.rate)}</span>
                    <strong>₹ {money.format(line.amount)}</strong>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>
      </details>
    </article>
  )
}

function publishedAbstractRows(
  recipe: RateAnalysisRecipe,
  summary: ReturnType<typeof calculateRateAnalysis>
): RateAnalysisStoredRow[] {
  const published = recipe.recalculation?.abstract ?? recipe.storedValues?.abstract
  if (published?.length) return published
  return [
    { label: 'A. Cost of Materials', value: '', unit: '', basis: '', percent: '', amount: summary.sectionTotals.materials.toFixed(2) },
    { label: 'B. Hire charges of Machinery', value: '', unit: '', basis: '', percent: '', amount: summary.sectionTotals.machinery.toFixed(2) },
    { label: 'C. Cost of Labour', value: '', unit: '', basis: '', percent: '', amount: summary.sectionTotals.labour.toFixed(2) },
    { label: 'Total (A+B+C)', value: '', unit: '', basis: '', percent: '', amount: summary.baseCost.toFixed(2) },
    { label: `Add contractor profit / overhead`, value: '', unit: '', basis: '', percent: `${recipe.overheadPercent}%`, amount: summary.overheadAmount.toFixed(2) },
    { label: 'Total cost', value: '', unit: '', basis: '', percent: '', amount: summary.totalCost.toFixed(2) },
    { label: `Rate per ${recipe.unit || 'unit'}`, value: '', unit: '', basis: `${formatQuantity(recipe.outputQuantity)} ${recipe.unit || 'unit'}`, percent: '', amount: summary.ratePerUnit.toFixed(2) }
  ]
}

function abstractRowBasis(row: RateAnalysisStoredRow): string {
  return [row.basis, row.percent ? `${row.percent}${row.percent.includes('%') ? '' : '%'}` : '', row.unit]
    .filter(Boolean)
    .join(' · ')
}

function abstractRowAmount(row: RateAnalysisStoredRow): string {
  const amount = row.amount || row.value
  if (!amount) return '—'
  return /^₹|\brs\.?\b/i.test(amount) ? amount : `₹ ${amount}`
}

function BackendSourceFigures({
  figures,
  itemCode
}: {
  figures: RateAnalysisFigure[]
  itemCode: string
}): JSX.Element {
  const [loaded, setLoaded] = useState<Array<{
    figure: RateAnalysisFigure
    url?: string
    error?: string
  }>>(() => figures.map((figure) => ({ figure })))

  useEffect(() => {
    let cancelled = false
    const objectUrls: string[] = []
    setLoaded(figures.map((figure) => ({ figure })))
    void Promise.all(
      figures.map(async (figure) => {
        const { data, error } = await supabase.storage.from('ssr-figures').download(figure.objectPath)
        if (error || !data) {
          return { figure, error: error?.message ?? 'Published image could not be loaded.' }
        }
        if (cancelled) return { figure }
        const url = URL.createObjectURL(data)
        objectUrls.push(url)
        return { figure, url }
      })
    ).then((results) => {
      if (!cancelled) setLoaded(results)
    })
    return () => {
      cancelled = true
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [figures])

  return (
    <section className="backend-data-figures" aria-label="Published source figures">
      <header>
        <strong>Published figures</strong>
        <small>{figures.length ? `${figures.length} image${figures.length === 1 ? '' : 's'}` : 'None published'}</small>
      </header>
      {figures.length === 0 ? (
        <div className="backend-data-figure-empty">This published DATA has no source figure attached.</div>
      ) : (
        <div className="backend-data-figure-strip">
          {loaded.map(({ figure, url, error }) => (
            <figure key={figure.key}>
              {url ? (
                <img
                  src={url}
                  alt={`${itemCode} published source figure`}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className={`backend-data-figure-state ${error ? 'error' : ''}`} title={error}>
                  {error ? 'Image unavailable' : 'Loading image…'}
                </div>
              )}
              {figure.page ? <figcaption>Page {figure.page}</figcaption> : null}
            </figure>
          ))}
        </div>
      )}
    </section>
  )
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(
    Number.isFinite(value) ? value : 0
  )
}

function backendDataNode(item: MasterItem): ProjectNode {
  return {
    id: `backend-data-${item.side}-${item.category}-${item.code}`,
    kind: 'item',
    name: item.description,
    children: [],
    itemSource: item.side,
    itemCode: item.code,
    itemDescription: item.description,
    unit: item.unit ?? undefined,
    categoryKey: item.category,
    sorCatalogue: item.sorCatalogue
  }
}

function scopeLabel(scope: CompiledDataScope, scopeName?: string): string {
  if (scope === 'component_edit') return `Component edit${scopeName ? ` · ${scopeName}` : ''}`
  if (scope === 'item_edit') return 'Individual rate edit'
  if (scope === 'lead_edit') return 'DATA + Lead'
  if (scope === 'shared_edit') return 'Shared DATA edit'
  return 'Shared DATA'
}

/**
 * The DATA print view is the individual SSR/SOR code sheets themselves — the
 * same sheet each code opens — laid out one after another so they flow
 * continuously across pages of the project's chosen paper size.
 */
export function DataDashboardReport({
  project,
  entries,
  fontScale = 1,
  onPdfReady
}: {
  project: EestimateProject
  entries: CompiledDataDashboardEntry[]
  fontScale?: number
  onPdfReady?: (url: string | null) => void
}): JSX.Element {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Stable identity: the geometry feeds a build effect, so a fresh object on
  // every render would rebuild the PDF forever.
  const printSettings = useMemo(
    () => resolveProjectPrintSettings(project.projectPrintSettings),
    [project.projectPrintSettings]
  )
  const { pageSize, orientation, margins } = printSettings

  // `project` is a fresh object after every edit anywhere in the estimate, and
  // collecting the sheets then rendering them is seconds of work on the thread
  // that also answers the keyboard. Wait for the editing to stop first.
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setPdfUrl(null)
    setError(null)
    onPdfReady?.(null)

    const handle = window.setTimeout(() => {
      const sheets = collectDataSheets(project, entries)
      if (sheets.length === 0) {
        setError('No compiled SSR/SOR codes are available. Click Sync and try again.')
        return
      }

      void buildDataSheetsPrintPdf({
        project,
        sheets,
        geometry: { pageSize, orientation, margins, fontScale }
      })
        .then((bytes) => {
          if (cancelled) return
          const copy = new ArrayBuffer(bytes.byteLength)
          new Uint8Array(copy).set(bytes)
          objectUrl = URL.createObjectURL(new Blob([copy], { type: 'application/pdf' }))
          setPdfUrl(objectUrl)
          onPdfReady?.(objectUrl)
        })
        .catch((reason: unknown) => {
          if (cancelled) return
          setError(reason instanceof Error ? reason.message : String(reason))
          onPdfReady?.(null)
        })
    }, PRINT_REBUILD_DELAY_MS)

    return () => {
      cancelled = true
      window.clearTimeout(handle)
      onPdfReady?.(null)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [entries, fontScale, margins, onPdfReady, orientation, pageSize, project])

  if (error) {
    return <div className="data-dashboard-print-message error">{error}</div>
  }
  if (!pdfUrl) {
    return (
      <div className="data-dashboard-print-message">
        Assembling {entries.length} SSR/SOR code{entries.length === 1 ? '' : 's'} into a continuous
        print flow…
      </div>
    )
  }

  return (
    <div className="data-dashboard-print-flow">
      <PdfPageStack src={pdfUrl} zoom={100} />
    </div>
  )
}
