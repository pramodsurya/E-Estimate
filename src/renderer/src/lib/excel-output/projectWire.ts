/**
 * Project Dashboard Excel wiring: assembles a ProjectDashboardInput from the
 * live store and compiles it through the native Excel engine.
 *
 * Mapping rules (fail-loud — unknown keys, unsynced leads, quantity-less
 * rows all throw naming the culprit):
 * - Components: every component/subcomponent node gets Abstract + Detailed
 *   sheets via the shared prepareComponentExcelParts; sub-components roll
 *   into their parent as S- rows. General Abstract lines follow the
 *   estimator's componentLines order (top-level components only).
 * - Items: staticQty seeds from the component abstract rawQty; the live
 *   reference wins wherever a detail cell exists. dataKey resolves through
 *   the DATA sheet's representative node, falling back to recipe identity;
 *   items with no DATA sheet get a manual-rate row at the estimator's
 *   synced rate (or throw when even that is missing).
 * - Lead: the existing Lead Statement payload is built first from the synced
 *   dashboard snapshot. Its stable variant ids identify the exported rate
 *   cells.
 * - DATA: the existing SSR/SOR workbook payload is reused. Recipe lead rows
 *   carry those variant ids, so the native writer replaces copied lead rates
 *   with formulas to Lead Statement and exposes each live adopted-rate cell
 *   back to the component Abstract.
 * - Seigniorage: owned rows convert the Abstract quantity by a static
 *   factor; combined rows carry their static chargeable quantity.
 * - Bund and Guide Wall components reuse their special calculated sheets.
 *   Generated rows reference exact recorded total cells; manually added
 *   Univer items remain on the normal combined Detailed sheet.
 */
import { buildProjectDashboardPayload, planProjectAddresses, projectExcelFileName, type ProjectCellRef, type ProjectChargeInput, type ProjectComponentInput, type ProjectDashboardInput, type ProjectDataInput, type ProjectItemInput, type ProjectLeadInput, type ProjectSeigInput, type ProjectSheetPayload } from './projectExcel'
import { applyGeneratedExcelFont, excelPrintSettings, resolveExcelDocumentSettings } from './excelDocumentSettings'
import { excelSignatureRows } from './excelSignature'
import { buildDataExcelPayload } from './dataExcel'
import { buildLeadExcelPayload } from './leadPayload'
import { buildSeigniorageExcelPayload } from './seignioragePayload'
import { prepareComponentExcelParts } from './componentDetailPrep'
import { prepareBundExcelPlan, projectBundSheetNames } from './bundExcel'
import { guideWallTotalKey, prepareGuideWallExcelPlan, projectGuideWallSheetName } from './guideWallExcel'
import { buildCoverExcelPayload } from './coverExcel'
import { preparePageExcelPayload, projectPageSheetName } from './pageExcel'
import { calculateDataSheets, collectDataSheets, type DataSheet } from '../dataSheets'
import { buildRateAnalysisRenderData } from '../typist-output/dataTypst'
import { resolveSeigniorageRowDescription } from '../typist-output/seigniorageTypst'
import { buildBundOutputModel } from '../typist-output/bund/bundTypst'
import { buildGuideWallRenderData } from '../typist-output/guidewall/guideWallTypst'
import { projectItemKey } from '../projectItems'
import { collectProjectItems, computeProjectPrintInputs, projectDashboardIsReady } from '../projectPrintInputs'
import { dashboardItemIsSynced } from '../dashboardSync'
import { useStore } from '../../store/useStore'
import type { EestimateProject, ProjectNode } from '../../types/project'
import type { RateAnalysisRecipe } from '../../types/rateAnalysis'

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function parsePercent(label: string, what: string): number {
  const match = /(\d+(?:\.\d+)?)\s*%/.exec(label)
  if (!match) throw new Error(`Project Excel: cannot parse percent from '${label}' (${what}).`)
  return Number(match[1])
}

function isComponentKind(node: ProjectNode): boolean {
  return node.kind === 'component' || node.kind === 'subcomponent'
}

function materialWords(value: string | null | undefined): string[] {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter((word) => word.length > 2 && !['material', 'other', 'others'].includes(word))
}

function seigniorageMatchesLeadMaterial(
  row: ReturnType<typeof computeProjectPrintInputs>['seigniorage']['rows'][number],
  materialName: string
): boolean {
  const wanted = materialWords(materialName)
  const available = new Set(materialWords([
    row.materialLabel,
    row.recipeMaterialDesc,
    row.charge?.mineral_name
  ].filter(Boolean).join(' ')))
  return wanted.length > 0 && (wanted.every((word) => available.has(word)) || wanted.some((word) => available.has(word)))
}

export async function assembleProjectDashboardInput(project: EestimateProject, preparedDataSheets?: DataSheet[]): Promise<ProjectDashboardInput> {
  const items = collectProjectItems(project.root)
  if (!projectDashboardIsReady(project, items)) {
    throw new Error('Project Excel: run Project Sync first — dashboards are not compiled.')
  }
  const snapshot = project.dashboardSnapshot
  const rootPages = (await Promise.all(
    project.root.children
      .filter((child) => child.kind === 'page' && child.pageTemplate !== 'front')
      .map(async (page) => {
        const payload = await preparePageExcelPayload(project, page, projectPageSheetName(page))
        return payload ? { ...payload, printSettings: excelPrintSettings(resolveExcelDocumentSettings(project, `item-doc-${page.id}`, page)) } : null
      })
  )).filter((page) => page !== null)
  const nodeById = new Map(items.map((n) => [n.id, n] as [string, ProjectNode]))
  // Every component/subcomponent node except the root gets its own sheets.
  const sheetComps: ProjectNode[] = []
  const visit = (n: ProjectNode): void => {
    for (const child of n.children) {
      if (isComponentKind(child)) sheetComps.push(child)
      visit(child)
    }
  }
  visit(project.root)
  const subsOf = (node: ProjectNode): string[] =>
    node.children.filter(isComponentKind).map((sub) => sub.name)

  const printInputs = computeProjectPrintInputs(project, items)
  const projectRecipes = printInputs.recipes
  const dataEntries = snapshot?.dataDashboardEntries ?? []
  const dataSheets = preparedDataSheets ?? await calculateDataSheets(collectDataSheets(project, dataEntries))
  const sheetByNodeId = new Map<string, DataSheet>()
  const sheetsByRecipeKey = new Map<string, DataSheet[]>()
  for (const sheet of dataSheets) {
    if (sheet.itemNode && !sheetByNodeId.has(sheet.itemNode.id)) sheetByNodeId.set(sheet.itemNode.id, sheet)
    const list = sheetsByRecipeKey.get(sheet.recipe.itemKey) ?? []
    list.push(sheet)
    sheetsByRecipeKey.set(sheet.recipe.itemKey, list)
  }

  const components: ProjectComponentInput[] = []
  const projectItems: ProjectItemInput[] = []
  const manualDataRows: ProjectDataInput[] = []
  const itemDataKey = new Map<string, string>()
  for (const comp of sheetComps) {
    const compRates: Record<string, number | null> = snapshot?.componentRates?.[comp.id] ?? {}
    const compRecipes: Record<string, RateAnalysisRecipe> = snapshot?.componentRecipes?.[comp.id] ?? {}
    const rateOf = (n: ProjectNode): number | undefined => {
      const rate = compRates[n.id]
      return dashboardItemIsSynced(snapshot, n) && typeof rate === 'number' ? rate : undefined
    }
    const parts = await prepareComponentExcelParts(project, comp, compRecipes, rateOf)
    const directAbstract = parts.renderData.abstract.filter((row) => !row.sl.startsWith('S'))
    const itemKeys = parts.directNodes.map((n) => projectItemKey(n))
    let templateSheets: ProjectSheetPayload[] = []
    const templateQuantityRefs = new Map<string, ProjectCellRef>()
    if (comp.templateId === 'bund' && comp.bund) {
      const bundPlan = await prepareBundExcelPlan(
        buildBundOutputModel(project, comp),
        projectBundSheetNames(comp.name, comp.id)
      )
      templateSheets = bundPlan.sheets
      parts.directNodes.forEach((item, i) => {
        if (!item.templateGenerated) return
        const ref = bundPlan.totalRefs.get(item.id)
        if (!ref) {
          throw new Error(`Project Excel: no calculated Bund total cell was generated for '${itemKeys[i]}'.`)
        }
        templateQuantityRefs.set(itemKeys[i], ref)
      })
    } else if (comp.templateId === 'guide-wall' && comp.guideWall) {
      const guidePlan = await prepareGuideWallExcelPlan(
        buildGuideWallRenderData(project, comp, compRecipes),
        projectGuideWallSheetName(comp.name, comp.id)
      )
      templateSheets = guidePlan.sheets
      parts.directNodes.forEach((item, i) => {
        if (!item.templateGenerated) return
        const role = item.templateItemRole
        if (role !== 'wall' && role !== 'base' && role !== 'excavation') {
          throw new Error(`Project Excel: Guide Wall item '${itemKeys[i]}' has no Guide Wall role.`)
        }
        const ref = guidePlan.totalRefs.get(guideWallTotalKey(role, item.itemCode || ''))
        if (!ref) {
          throw new Error(`Project Excel: no ${role} total cell was generated for Guide Wall item '${itemKeys[i]}'.`)
        }
        templateQuantityRefs.set(itemKeys[i], { sheet: guidePlan.sheets[0].name, ...ref })
      })
    }
    components.push({
      name: comp.name,
      signatures: excelSignatureRows(project, comp.id),
      printSettings: excelPrintSettings(resolveExcelDocumentSettings(project, `component-${comp.id}`, comp)),
      code: comp.itemCode,
      itemKeys,
      headers: parts.headers,
      details: parts.details,
      templateSheets: templateSheets.map((sheet) => ({
        ...sheet,
        printSettings: excelPrintSettings(resolveExcelDocumentSettings(project, `component-${comp.id}`, comp))
      })),
      pages: (await Promise.all(
        comp.children
          .filter((child) => child.kind === 'page')
          .map(async (page) => {
            const payload = await preparePageExcelPayload(project, page, projectPageSheetName(page))
            return payload ? { ...payload, printSettings: excelPrintSettings(resolveExcelDocumentSettings(project, `item-doc-${page.id}`, page)) } : null
          })
      )).filter((page) => page !== null),
      subs: subsOf(comp)
    })
    parts.directNodes.forEach((node, i) => {
      const key = itemKeys[i]
      const recipe = compRecipes[node.id] ?? projectRecipes[node.id]
      let sheet = sheetByNodeId.get(node.id)
      if (!sheet && recipe) sheet = (sheetsByRecipeKey.get(recipe.itemKey) ?? [])[0]
      let dataKey: string
      if (sheet) {
        dataKey = sheet.id
      } else {
        const manualRate = rateOf(node)
        if (!finite(manualRate)) {
          throw new Error(`Project Excel: item '${key}' has no DATA sheet and no synced rate.`)
        }
        dataKey = `manual:${key}`
        manualDataRows.push({
          key: dataKey,
          code: node.itemCode || '',
          description: `Manual rate — ${parts.headers[i]?.name || key}`,
          unit: node.unit || '',
          sorRate: manualRate,
          manualRate: true,
          outputQty: 1,
          leadKeys: []
        })
      }
      itemDataKey.set(key, dataKey)
      projectItems.push({
        key,
        component: comp.name,
        code: parts.headers[i]?.code || '',
        name: parts.headers[i]?.name || '',
        unit: parts.headers[i]?.unit || '',
        description: parts.headers[i]?.description || '',
        staticQty: directAbstract[i]?.rawQty ?? null,
        requiresDetailQuantity: !node.templateGenerated,
        detailRef: templateQuantityRefs.get(key) ?? null,
        dataKey
      })
    })
  }

  // ---- DATA rows: base = estimator final minus estimator lead portion. ----
  const dataInputs: ProjectDataInput[] = []
  const leadInputs: ProjectLeadInput[] = []
  const entriesByVariant = new Map(
    (snapshot?.leadDashboardEntries ?? []).map((e) => [e.variantId, e])
  )
  for (const sheet of dataSheets) {
    const recipe = sheet.recipe
    const leadKeys = sheet.leadApplications.map((app) => `${sheet.id}::${app.id}`)
    let base: number
    if (sheet.sorPrintRate) {
      const print = sheet.sorPrintRate
      if (!print.hasNumericRate) {
        dataInputs.push({
          key: sheet.id,
          code: recipe.itemCode,
          description: recipe.description,
          unit: recipe.unit,
          sorRate: null,
          sorRateText: print.rateText || 'Rate not published',
          outputQty: recipe.outputQuantity || 1,
          leadKeys: []
        })
        continue
      }
      base = print.finalRate - print.leadRate
    } else {
      const render = buildRateAnalysisRenderData(recipe, sheet.leadApplications, sheet.leadVariants, {
        scopeName: sheet.scopeName,
        usagePath: sheet.usagePath,
        scope: sheet.scope
      }, sheet.calculatedSummary)
      const outputQty = render.totals.output_quantity || 1
      const final = render.totals.rate_per_unit
      const lead = render.totals.lead_total / outputQty
      if (!finite(final) || !finite(lead)) {
        throw new Error(`Project Excel: DATA '${sheet.id}' has no computed rate — sync DATA first.`)
      }
      base = final - lead
    }
    if (!finite(base)) throw new Error(`Project Excel: DATA '${sheet.id}' base rate is not finite.`)
    dataInputs.push({
      key: sheet.id,
      code: recipe.itemCode,
      description: recipe.description,
      unit: recipe.unit,
      sorRate: base,
      outputQty: recipe.outputQuantity || 1,
      leadKeys
    })
    for (const app of sheet.leadApplications) {
      const entry = entriesByVariant.get(app.variantId)
      if (!entry) throw new Error(`Project Excel: lead variant '${app.variantId}' is not synced.`)
      leadInputs.push({
        key: `${sheet.id}::${app.id}`,
        label: `${entry.materialName} (${entry.variantName})`,
        unit: app.unit,
        recipeKey: sheet.id,
        qtyPerOutput: app.quantity,
        grossRate: app.grossRate,
        km: entry.leadKm
      })
    }
  }
  dataInputs.push(...manualDataRows)

  // ---- Seigniorage rows: preserve every backend quantity term. ----
  const seigInputs: ProjectSeigInput[] = []
  const variantsById = new Map((project.leadChart?.variants ?? []).map((variant) => [variant.id, variant]))
  const applications = project.leadChart?.applications ?? []
  for (const row of printInputs.seigniorage.rows) {
    if (!row.materialKey && !row.charge && row.seigRate == null) continue
    const description = resolveSeigniorageRowDescription(project, row)
    const terms = (row.quantityTerms ?? []).map((term) => {
      const node = term.itemNodeId ? nodeById.get(term.itemNodeId) : undefined
      const itemKey = node ? projectItemKey(node) : undefined
      const matchedApplications = term.itemNodeId
        ? applications.filter((application) => {
            if (application.itemNodeId !== term.itemNodeId) return false
            const sourceVariantId = application.sourceVariantId ?? application.variantId
            const variant = variantsById.get(sourceVariantId)
            const adopted = variantsById.get(application.variantId)
            if (adopted?.weightedLead && !application.sourceVariantId) {
              throw new Error(
                `Project Excel: weighted Lead '${adopted.variantName || adopted.materialName}' on Item '${application.itemCode}' has no retained source route. Reapply that weighted Lead once.`
              )
            }
            return Boolean(variant && seigniorageMatchesLeadMaterial(row, variant.materialName))
          })
        : []
      if (matchedApplications.length > 1) {
        throw new Error(`Project Excel: Seigniorage '${description}' maps to multiple Lead variants for one Item usage.`)
      }
      if (itemKey && typeof term.factor === 'number') {
        return {
          itemKey,
          factor: term.factor,
          leadVariantId:
            matchedApplications[0]?.sourceVariantId ?? matchedApplications[0]?.variantId
        }
      }
      if (typeof term.staticQuantity === 'number') {
        return {
          staticQty: term.staticQuantity,
          leadVariantId:
            matchedApplications[0]?.sourceVariantId ?? matchedApplications[0]?.variantId
        }
      }
      throw new Error(`Project Excel: Seigniorage '${description}' contains an unresolved backend quantity term.`)
    })
    if (!terms.length) throw new Error(`Project Excel: seigniorage row '${row.id}' has no calculation terms.`)
    seigInputs.push({
      key: row.id,
      description,
      unit: row.unit,
      terms,
      policyRate: row.seigRate,
      permitPercent: row.permitPercent
    })
  }

  // ---- Charges follow the estimator's General Abstract lines. ----
  const charges: ProjectChargeInput[] = []
  for (const line of printInputs.abstract.lines) {
    if (line.kind === 'component' || line.kind === 'total' || line.kind === 'grand') continue
    if (line.kind === 'miscellaneous') {
      if (!finite(line.amount)) throw new Error(`Project Excel: misc '${line.label}' has no amount.`)
      charges.push({ kind: 'misc', label: line.label, staticAmount: line.amount })
    } else if (line.kind === 'gst') {
      charges.push({ kind: 'gst', label: line.label, percent: printInputs.gstRate })
    } else if (line.kind === 'charge') {
      if (line.key === 'seigniorage') charges.push({ kind: 'seigniorage', label: line.label })
      else if (line.key === 'dmf') charges.push({ kind: 'dmf', label: line.label, percent: parsePercent(line.label, 'DMF') })
      else if (line.key === 'smet') charges.push({ kind: 'smet', label: line.label, percent: parsePercent(line.label, 'SMET') })
      else if (line.key === 'nac') charges.push({ kind: 'nac', label: line.label, percent: printInputs.nacPercent })
      else if (line.key === 'labour-cess') charges.push({ kind: 'cess', label: line.label, percent: printInputs.labourCessPercent })
      else if (line.key === 'permit') charges.push({ kind: 'permit', label: line.label })
      else throw new Error(`Project Excel: unknown charge '${line.key}'.`)
    }
  }

  // General Abstract order = estimator component lines; sheets for all.
  const order = new Map(
    printInputs.abstract.componentLines.map((line, i) => [line.nodeId, i] as [string | undefined, number])
  )
  components.sort((a, b) => {
    const ao = order.get(sheetComps.find((c) => c.name === a.name)?.id)
    const bo = order.get(sheetComps.find((c) => c.name === b.name)?.id)
    return (ao ?? Number.MAX_SAFE_INTEGER) - (bo ?? Number.MAX_SAFE_INTEGER)
  })

  // General Abstract lines = top-level components only; sub-component costs
  // already flow through their parent's S- rows.
  const topNames = new Map(sheetComps.map((c) => [c.id, c.name] as [string, string]))
  const genOrder = printInputs.abstract.componentLines
    .map((line) => topNames.get(line.nodeId ?? ''))
    .filter((name): name is string => typeof name === 'string')
  if (genOrder.length !== printInputs.abstract.componentLines.length) {
    throw new Error('Project Excel: a General Abstract component has no workbook sheets.')
  }
  return {
    projectName: project.meta.name || project.root.name,
    signatures: excelSignatureRows(project, 'project'),
    abstract: printInputs.abstract,
    genOrder,
    rootPages,
    components,
    items: projectItems,
    data: dataInputs,
    leads: leadInputs,
    seigniorage: seigInputs,
    charges
  }
}

export async function exportProjectDashboardExcel(): Promise<void> {
  const current = useStore.getState().project
  if (!current) throw new Error('No active project.')
  const snapshot = current.dashboardSnapshot
  const dataSheets = await calculateDataSheets(collectDataSheets(current, snapshot?.dataDashboardEntries ?? []))
  const input = await assembleProjectDashboardInput(current, dataSheets)
  const payload = buildProjectDashboardPayload(input)
  const addressPlan = planProjectAddresses(input)
  const sheetPrintSettings = Object.fromEntries(payload.sheets
    .filter((sheet) => sheet.printSettings)
    .map((sheet) => [sheet.name, sheet.printSettings]))
  sheetPrintSettings[addressPlan.genSheet] = excelPrintSettings(resolveExcelDocumentSettings(current, 'general-abstract', undefined, { orientation: 'portrait' }))
  sheetPrintSettings['Front Page'] = excelPrintSettings(resolveExcelDocumentSettings(current, 'front-cover', current.root.children.find((child) => child.pageTemplate === 'front'), { orientation: 'portrait' }))
  sheetPrintSettings['Lead Statement'] = excelPrintSettings(resolveExcelDocumentSettings(current, 'lead-statement'))
  sheetPrintSettings['Seigniorage Statement'] = excelPrintSettings(resolveExcelDocumentSettings(current, 'seigniorage-statement', undefined, { orientation: 'landscape' }))
  for (const sheet of payload.sheets) {
    const generatedAbstract = sheet.name === addressPlan.genSheet || [...addressPlan.absSheet.values()].includes(sheet.name)
    if (generatedAbstract) {
      applyGeneratedExcelFont(sheet.grid, sheetPrintSettings[sheet.name] ?? excelPrintSettings(resolveExcelDocumentSettings(current)))
    }
  }
  const dataPayload = buildDataExcelPayload(current, dataSheets)
  for (const row of input.data.filter((entry) => entry.manualRate)) {
    dataPayload.sor.push({
      excelKey: row.key,
      sl: dataPayload.sor.length + 1,
      description: row.description,
      unit: row.unit,
      rate: row.sorRate ?? null,
      baseRate: row.sorRate ?? null,
      outputQty: row.outputQty ?? 1,
      leadLinks: [],
      rateText: row.sorRateText
    })
  }
  const lead = buildLeadExcelPayload(current, snapshot?.leadDashboardEntries ?? [])
  const seigniorage = buildSeigniorageExcelPayload(
    current,
    computeProjectPrintInputs(current).seigniorage
  )
  const cover = await buildCoverExcelPayload(current)
  const result = await window.api.excel.compile({
    ...dataPayload,
    kind: 'project',
    preferPath: true,
    printSettings: excelPrintSettings(resolveExcelDocumentSettings(current)),
    sheetPrintSettings,
    lead,
    seigniorage,
    cover,
    project: {
      sheets: payload.sheets,
      links: payload.links,
      seigniorageLinks: payload.seigniorageLinks,
      coverCostRef: payload.coverCostRef
    }
  })
  if (!result || !result.ok || !result.filePath) {
    throw new Error(result?.error || 'Excel engine did not return a workbook path.')
  }
  if (typeof window.api.export.workbook !== 'function') {
    throw new Error('Excel export channel is unavailable.')
  }
  await window.api.export.workbook(
    '',
    // The native export command appends .xlsx to the supplied name.
    projectExcelFileName(current.meta.name || current.root.name).replace(/\.xlsx$/i, ''),
    undefined,
    { sourcePath: result.filePath }
  )
}
