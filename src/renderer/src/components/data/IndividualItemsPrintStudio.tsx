import EEstimatePrintStudio from '../typst/EEstimatePrintStudio'
import { useStore } from '../../store/useStore'
import { buildDataExcelPayload } from '../../lib/excel-output/dataExcel'
import { calculateDataSheets, collectDataSheets } from '../../lib/dataSheets'
import {
  dashboardContextMatches,
  dashboardDataCompileSignature,
  syncDataDashboardSnapshot
} from '../../lib/dashboardSync'
import {
  INDIVIDUAL_ITEMS_SCOPE,
  individualItemsCompileInputs,
  individualItemsTypstTemplate
} from '../../lib/typist-output/individualItemsTypst'
import { resolveProjectDocumentSettings } from '../../lib/typist-output/documentSettings'
import {
  excelPrintSettings,
  resolveExcelDocumentSettings
} from '../../lib/excel-output/excelDocumentSettings'
import type { EestimateProject } from '../../types/project'
import type { RateAnalysisRecipe } from '../../types/rateAnalysis'

/** The register's Excel download includes its linked DATA, not an isolated rate list. */
export async function exportIndividualItemsExcel(project: EestimateProject) {
  let current = useStore.getState().project ?? project
  const snapshot = current.dashboardSnapshot
  if (
    !dashboardContextMatches(snapshot, current) ||
    !snapshot?.dataSyncedAt ||
    snapshot.dataCompileSignature !== dashboardDataCompileSignature(current)
  ) {
    const compiled = await syncDataDashboardSnapshot(current)
    const latest = useStore.getState().project
    if (
      latest?.id !== current.id ||
      !dashboardContextMatches(compiled, latest) ||
      dashboardDataCompileSignature(latest) !==
        dashboardDataCompileSignature(current)
    )
      throw new Error('Project changed during export. Please try again.')
    useStore.getState().setDashboardSnapshot(compiled)
    current = useStore.getState().project!
  }
  const sheets = await calculateDataSheets(
    collectDataSheets(
      current,
      current.dashboardSnapshot?.dataDashboardEntries ?? []
    )
  )
  const payload = buildDataExcelPayload(current, sheets)
  const result = await window.api.excel.compile({
    ...payload,
    preferPath: true,
    printSettings: excelPrintSettings(
      resolveExcelDocumentSettings(current, INDIVIDUAL_ITEMS_SCOPE)
    )
  })
  if (!result?.ok || !result.filePath)
    throw new Error(
      result?.error || 'Excel engine did not return a workbook path.'
    )
  await window.api.export.workbook(
    '',
    `${current.meta.name || 'Estimate'} — Individual Items and DATA.xlsx`,
    undefined,
    { sourcePath: result.filePath }
  )
}
export default function IndividualItemsPrintStudio({
  project,
  recipes,
  onClose
}: {
  project: EestimateProject
  recipes: RateAnalysisRecipe[]
  onClose: () => void
}) {
  const updateDocument = useStore((state) => state.updatePrintStudioDocument)
  return (
    <EEstimatePrintStudio
      scopeKey={INDIVIDUAL_ITEMS_SCOPE}
      title="Individual Items"
      subtitle="Materials, machinery and labour resource rates"
      defaultTypstSource={individualItemsTypstTemplate()}
      savedTypstSource={project.printStudioDocuments?.[INDIVIDUAL_ITEMS_SCOPE]}
      compileInputs={individualItemsCompileInputs(project, recipes)}
      visualize={false}
      projectDocumentSettings={resolveProjectDocumentSettings(
        project.projectPrintSettings
      )}
      savedDocumentSettings={
        project.printStudioDocumentSettings?.[INDIVIDUAL_ITEMS_SCOPE]
      }
      onExportExcel={() => exportIndividualItemsExcel(project)}
      onSave={async (source, settings) => {
        updateDocument(INDIVIDUAL_ITEMS_SCOPE, source, settings)
        await useStore.getState().saveProject({ requireSaved: true })
      }}
      onClose={onClose}
    />
  )
}
