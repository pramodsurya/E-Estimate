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
  buildLeadRenderData,
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

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
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
  const exportLeadStatementExcel = async (): Promise<void> => {
    const current = useStore.getState().project ?? project
    const snapshot = await syncLeadDashboardSnapshot(current)
    setDashboardSnapshot(snapshot)
    const currentEntries = snapshot.leadDashboardEntries ?? current.dashboardSnapshot?.leadDashboardEntries ?? entries
    const data = buildLeadRenderData(current, currentEntries, leadMapCaptureFromProject(current))
    const payload = {
      kind: 'lead',
      preferPath: true,
      lead: {
        project: data.project,
        title: data.title,
        subtitle: data.subtitle,
        year: data.year,
        zone: data.zone,
        notes: data.notes,
        rows: data.rows.map((item) => ({
          sl: item.sl,
          name: item.name,
          quarry: item.quarry,
          conveyanceClass: item.conveyance_class,
          leadKm: item.lead_km,
          liftM: item.lift_m,
          rate: item.rate,
          uses: item.uses,
          leadTypeTag: item.lead_type_tag ?? null
        })),
        materials: data.breakdowns.map((material) => ({
          sl: material.sl,
          name: material.name,
          leadKm: material.lead_km,
          leadTypeTag: material.lead_type_tag ?? null,
          route: material.route,
          rateUnit: material.rate_unit,
          liftM: material.lift_m ?? null,
          chargedLiftM: material.charged_lift_m ?? null,
          rate: material.rate,
          avgLead: material.avg_lead
            ? {
                modeLabel: material.avg_lead.mode_label,
                componentName: material.avg_lead.component_name,
                pointCount: material.avg_lead.point_count,
                avgKmText: material.avg_lead.avg_km_text,
                routes: material.avg_lead.routes.map((point) => ({
                  index: point.index,
                  chainageText: point.chainage_text,
                  chainageM: point.chainage_m ?? null,
                  routeKmText: point.route_km_text,
                  routeKm: point.route_km ?? null
                }))
              }
            : null,
          weightedLead: material.weighted_lead
            ? {
                formula: material.weighted_lead.formula,
                entries: material.weighted_lead.entries.map((entry) => ({
                  name: entry.name,
                  leadKm: entry.lead_km,
                  quantityText: entry.quantity_text,
                  unit: entry.unit,
                  product: entry.product
                })),
                totalQuantityText: material.weighted_lead.total_quantity_text,
                weightedAvgKmText: material.weighted_lead.weighted_avg_km_text
              }
            : null,
          steps: material.steps.map((step) => ({
            label: step.label,
            expression: step.expression,
            amount: step.amount,
            amountValue: step.amount_value
          })),
          calculation: material.calculation
            ? {
                leadRate: material.calculation.leadRate,
                loadingRate: material.calculation.loadingRate,
                unloadingRate: material.calculation.unloadingRate,
                liftRate: material.calculation.liftRate
              }
            : null
        })),
        signature: data.signature.map((sig) => ({
          designation: sig.designation,
          office: sig.office
        }))
      }
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
      onExportExcel={() => exportLeadStatementExcel()}
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
