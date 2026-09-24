import EEstimatePrintStudio from '../typst/EEstimatePrintStudio'
import { useStore } from '../../store/useStore'
import { excelPrintSettings, resolveExcelDocumentSettings } from '../../lib/excel-output/excelDocumentSettings'
import { isLeadMapLayoutSaved, normalizeLeadPrintSettings } from '../../lib/leadPrintLayout'
import { LEAD_MAP_IMAGE_PATH } from '../../lib/leadMapGeometry'
import { LEAD_SIGNATURE_SCOPE, resolveSignatureFooter } from '../../lib/signatureFooter'
import { resolveProjectDocumentSettings, type DocumentSettings } from '../../lib/typist-output/documentSettings'
import {
  LEAD_TABLE_PRELUDE,
  applyLeadMapLayoutToTypst,
  leadCompileInputs,
  leadCompileSource,
  leadMapCaptureFromProject,
  leadMapShadowFilesFromProject,
  leadStudioRuntimeData,
  leadTypstTemplate
} from '../../lib/typist-output/leadTypst'
import type {
  CompiledLeadDashboardEntry,
  EestimateProject,
  LeadApplication,
  LeadAssignment,
  LeadMapDirection,
  LeadPoint,
  LeadPrintSettings,
  LeadVariant,
  ProjectLocation
} from '../../types/project'
import { buildLeadExcelPayload } from '../../lib/excel-output/leadPayload'

interface Props {
  project: EestimateProject
  entries: CompiledLeadDashboardEntry[]
  variants: LeadVariant[]
  applications: LeadApplication[]
  assignments: LeadAssignment[]
  points: LeadPoint[]
  site: ProjectLocation | null
  mapDirections: LeadMapDirection[]
  printSettings?: LeadPrintSettings
  snapshotStale?: boolean
  onRequestSync?: () => Promise<void>
  onClose: () => void
}

const MAP_LAYOUT_NOTICE =
  'Please check Map Print Studio and adjust the map there, then Save. The route map is not included until it is saved.'

/** Opens the shared Print Studio with Lead data. Not a second studio UI. */
export default function LeadPrintStudioSession({
  project,
  entries,
  snapshotStale,
  onRequestSync,
  onClose
}: Props): JSX.Element {
  const persistedCapture = leadMapCaptureFromProject(project)
  const updatePrintStudioDocument = useStore((state) => state.updatePrintStudioDocument)
  const layout = normalizeLeadPrintSettings(project.leadChart?.printSettings)
  const signatureFooter = resolveSignatureFooter(project, LEAD_SIGNATURE_SCOPE)
  const projectDocumentSettings = resolveProjectDocumentSettings(project.projectPrintSettings)
  const mapSaved = isLeadMapLayoutSaved(
    layout,
    Boolean(project.printStudioShadowFiles?.[LEAD_MAP_IMAGE_PATH])
  )
  const mapCapture = (persistedCapture)
  const exportLeadStatementExcel = async (): Promise<void> => {
    const current = useStore.getState().project ?? project
    const snapshot = current.dashboardSnapshot
    if (!snapshot?.leadSyncedAt) throw new Error('No Lead snapshot exists. Use the Sync icon first.')
    const currentEntries = snapshot.leadDashboardEntries ?? entries
    const lead = buildLeadExcelPayload(current, currentEntries)
    const payload = {
      kind: 'lead',
      preferPath: true,
      printSettings: excelPrintSettings(resolveExcelDocumentSettings(current, 'lead-statement')),
      lead
    }
    const result = await window.api.excel.compile(payload)
    // No base64 fallback: a missing path or save channel fails loudly.
    if (!result || !result.ok || !result.filePath) {
      throw new Error(result?.error || 'Excel engine did not return a workbook path.')
    }
    if (typeof window.api?.export?.workbook !== 'function') {
      throw new Error('Excel export channel is unavailable.')
    }
    const fileName = `${current.meta.name || current.root.name || 'Estimate'} — Lead Statement.xlsx`
    await window.api.export.workbook('', fileName, undefined, { sourcePath: result.filePath })
  }

  return (
    <EEstimatePrintStudio
          scopeKey={'lead-statement'}
      title="Lead Statement & Conveyance Charges"
      subtitle="Lead Statement Code & Layout Studio"
      notice={mapSaved ? undefined : MAP_LAYOUT_NOTICE}
      defaultTypstSource={applyLeadMapLayoutToTypst(leadTypstTemplate(), layout, signatureFooter, false)}
      savedTypstSource={project.printStudioDocuments?.['lead-statement']}
      compileInputs={leadCompileInputs(project, entries, mapCapture)}
      compilePrelude={LEAD_TABLE_PRELUDE}
      shadowFiles={leadMapShadowFilesFromProject(project)}
      runtimeData={leadStudioRuntimeData(project, entries, mapCapture)}
      visualize={false}
      projectDocumentSettings={projectDocumentSettings}
      savedDocumentSettings={project.printStudioDocumentSettings?.['lead-statement']}
      snapshotRevision={project.dashboardSnapshot?.leadSyncedAt}
      snapshotStale={snapshotStale}
      onRequestSync={onRequestSync}
      onExportExcel={() => exportLeadStatementExcel()}
      assembleCompile={async (source) => {
        const current = useStore.getState().project ?? project
        const snapshot = current.dashboardSnapshot
        if (!snapshot?.leadSyncedAt) throw new Error('No Lead snapshot exists. Use the Sync icon first.')
        const currentEntries = snapshot.leadDashboardEntries ?? entries
        const capture = leadMapCaptureFromProject(current)
        return {
          mainContent: leadCompileSource(source),
          inputs: leadCompileInputs(current, currentEntries, capture),
          shadowFiles: leadMapShadowFilesFromProject(current)
        }
      }}
      onSave={async (source, settings: DocumentSettings | null) => {
        updatePrintStudioDocument('lead-statement', source, settings)
        await useStore.getState().saveProject({ requireSaved: true })
      }}
      onClose={onClose}
    />
  )
}
