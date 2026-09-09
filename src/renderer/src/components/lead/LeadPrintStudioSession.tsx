import { useMemo } from 'react'
import EEstimatePrintStudio from '../typst/EEstimatePrintStudio'
import { useStore } from '../../store/useStore'
import { syncLeadDashboardSnapshot } from '../../lib/dashboardSync'
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
  leadTypstTemplate,
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
  onClose: () => void
}

const MAP_LAYOUT_NOTICE =
  'Please check Map Print Studio and adjust the map there, then Save. The route map is not included until it is saved.'

/** Opens the shared Print Studio with Lead data. Not a second studio UI. */
export default function LeadPrintStudioSession({
  project,
  entries,
  onClose
}: Props): JSX.Element {
  const persistedCapture = leadMapCaptureFromProject(project)
  const updatePrintStudioDocument = useStore((state) => state.updatePrintStudioDocument)
  const setDashboardSnapshot = useStore((state) => state.setDashboardSnapshot)
  const layout = normalizeLeadPrintSettings(project.leadChart?.printSettings)
  const signatureFooter = resolveSignatureFooter(project, LEAD_SIGNATURE_SCOPE)
  const projectDocumentSettings = resolveProjectDocumentSettings(project.projectPrintSettings)
  const mapSaved = isLeadMapLayoutSaved(
    layout,
    Boolean(project.printStudioShadowFiles?.[LEAD_MAP_IMAGE_PATH])
  )
  const mapCapture = useMemo(() => persistedCapture, [persistedCapture])

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
      onSync={async () => {
        const current = useStore.getState().project
        if (!current || current.id !== project.id) throw new Error('The active project has changed.')
        const snapshot = await syncLeadDashboardSnapshot(current)
        if (useStore.getState().project !== current) {
          throw new Error('The project changed during Sync. Please Sync again.')
        }
        setDashboardSnapshot(snapshot)
        return leadCompileInputs(
          current,
          snapshot.leadDashboardEntries ?? [],
          leadMapCaptureFromProject(current)
        )
      }}
      assembleCompile={async (source) => {
        const current = useStore.getState().project ?? project
        const currentEntries = current.dashboardSnapshot?.leadDashboardEntries ?? entries
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
