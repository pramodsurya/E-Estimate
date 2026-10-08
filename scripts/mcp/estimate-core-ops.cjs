/**
 * Core Headless Operations for E-Estimate.
 * Used by CLI, Tests, and MCP Server.
 */
const fs = require('node:fs')
const path = require('node:path')
const { loadTs, supabase, getDashboardSync } = require('./ts-loader.cjs')

const tree = loadTs('src/renderer/src/lib/tree.ts')
const projectFile = loadTs('src/renderer/src/lib/projectFile.ts')
const sharedSheet = loadTs('src/renderer/src/lib/sharedSheet.ts')
const documentFinal = loadTs('src/renderer/src/lib/documentFinal.ts')
const itemCellRef = loadTs('src/renderer/src/lib/itemCellRef.ts')
const projectDataLib = loadTs('src/renderer/src/lib/projectData.ts')
const projectDataDefaults = loadTs('src/renderer/src/lib/projectDataDefaults.ts')

/**
 * Load project from disk
 */
function loadProject(projectPath) {
  const content = fs.readFileSync(projectPath, 'utf8')
  const json = JSON.parse(content)
  return projectFile.expandLoadedProject(json)
}

/**
 * Save project to disk
 */
function saveProject(project, projectPath) {
  const compacted = projectFile.compactProjectForSave(project)
  fs.writeFileSync(projectPath, JSON.stringify(compacted, null, 2), 'utf8')
  return projectPath
}

/**
 * Clean raw text/code to canonical SSR pattern:
 * e.g. "IRR-CCDW-2-25 & MORTH 21.07 (Page 784)" -> "IRR-CCDW-2-25"
 */
function cleanSsrCode(raw) {
  if (!raw || typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  const match = trimmed.match(/IRR-[A-Z]+-\d+(?:-\d+)?/i)
  if (match) return match[0].toUpperCase()
  return trimmed
}

/**
 * Intelligent Item Resolver against Supabase SSR database
 */
async function resolveItem({ rawCodeOrDescription, sorYear = '2026-27', originalRate = null, originalUnit = null }) {
  const cleaned = cleanSsrCode(rawCodeOrDescription)

  // 0. Try searching in sor_catalogue_item for Public Health / RCC Pipe items first (unless it is an explicit Irrigation SSR code)
  const isIrrSsr = /^IRR-/i.test(cleaned)
  const isPipeOrPh =
    !isIrrSsr &&
    (/public\s*health|table\s*[123]|hume|pipe|rcc\s*pipe/i.test(rawCodeOrDescription) ||
    /public\s*health|table\s*[123]|hume|pipe|rcc\s*pipe/i.test(cleaned))

  if (isPipeOrPh) {
    const fullText = `${rawCodeOrDescription} ${cleaned} ${originalRate || ''}`
    const diaMatch = fullText.match(/(\d+)\s*(?:mm|dia)/i)
    const dia = diaMatch ? diaMatch[1] : null
    const isNp3 = /NP-?3/i.test(fullText) || !/NP-?2|NP-?4/i.test(fullText)
    const pipeClass = isNp3 ? 'NP3' : (/NP-?2/i.test(fullText) ? 'NP2' : 'NP4')

    if (dia) {
      const q = `${dia} mm ${pipeClass}`
      try {
        const { data: matches } = await supabase.rpc('search_sor_catalogue_items', {
          p_sor_year: sorYear,
          p_query: q,
          p_limit: 10
        })

        const prefersSs = /socket|spigot|\bss\b|1402|2565|1756|3237/i.test(fullText)
        const sortedCatalogues = prefersSs
          ? ['PH_MATERIAL_03', 'PH_MATERIAL_01']
          : ['PH_MATERIAL_01', 'PH_MATERIAL_03']

        const pipeMatches = matches?.filter(
          m => sortedCatalogues.includes(m.catalogue_code) && m.unit === 'Metre'
        ).sort((a, b) => sortedCatalogues.indexOf(a.catalogue_code) - sortedCatalogues.indexOf(b.catalogue_code))

        const match = pipeMatches?.[0]
        if (match) {
          return {
            resolvedCode: match.item_code,
            itemSource: 'SOR',
            categoryKey: 'sor_catalogue',
            unit: match.unit || originalUnit || 'Metre',
            itemDescription: `${match.catalogue_name} — ${match.item_name} (${pipeClass})`,
            publishedRate: match.rate != null ? Number(match.rate) : null,
            rate: undefined, // Dynamic live resolution from Supabase SOR catalogue
            hasRecipe: false,
            existsInSsr: false,
            existsInSor: true,
            sorCatalogue: {
              catalogueCode: match.catalogue_code,
              catalogueName: match.catalogue_name,
              part: match.part,
              section: match.section,
              dimensions: match.dimensions,
              selectedYear: sorYear,
              publishedRate: match.rate != null ? Number(match.rate) : null,
              source: match.source,
              sourcePage: match.source_page
            },
            resolutionType: 'sor_catalogue_match',
            note: `Matched canonical Public Health SOR Catalogue item ${match.item_code} (${dia}mm ${pipeClass}) from ${match.source || 'SoR'} page ${match.source_page || ''}`
          }
        }
      } catch {
        // Proceed to other matches
      }
    }
  }

  // 1. Try querying ssr_item directly by cleaned code
  if (cleaned) {
    const { data: item, error: itemErr } = await supabase
      .from('ssr_item')
      .select('code,description,unit')
      .eq('code', cleaned)
      .maybeSingle()

    if (!itemErr && item) {
      // Check if recipe exists for this year in ssr_year
      const { data: yearRow } = await supabase
        .from('ssr_year')
        .select('base_rate,rates,totals')
        .eq('code', cleaned)
        .eq('year', sorYear)
        .maybeSingle()

      // Check unit mismatch (e.g. KG vs TONNE)
      const isKgToTonne =
        originalUnit && originalUnit.toUpperCase().startsWith('KG') &&
        item.unit && item.unit.toUpperCase().includes('TONNE')

      return {
        resolvedCode: item.code,
        itemSource: 'SSR',
        categoryKey: 'ssr_item',
        unit: item.unit || originalUnit || 'CUM',
        itemDescription: item.description,
        publishedRate: yearRow?.base_rate ?? null,
        rate: undefined, // Let SSR recipe supply the authoritative rate
        hasRecipe: Boolean(yearRow),
        existsInSsr: true,
        unitConversion: isKgToTonne ? { factor: 0.001, from: 'KG', to: 'TONNE' } : null,
        resolutionType: 'exact_code_match',
        note: `Matched canonical SSR item ${item.code} with ${yearRow ? 'active' : 'missing'} recipe for ${sorYear}`
      }
    }
  }

  // 2. Try text search in ssr_item by keywords if it wasn't a direct code match
  if (rawCodeOrDescription && rawCodeOrDescription.length > 3) {
    // Extract search keywords (e.g. "vibrated M-15", "murrum", "excavation")
    const words = rawCodeOrDescription
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !/^(page|item|table|with|from|than|into)$/i.test(w))
      .slice(0, 3)

    if (words.length > 0) {
      const orFilter = words.map(w => `description.ilike.%${w}%`).join(',')
      const { data: candidates } = await supabase
        .from('ssr_item')
        .select('code,description,unit')
        .or(orFilter)
        .limit(3)

      if (candidates && candidates.length > 0) {
        const best = candidates[0]
        const { data: yearRow } = await supabase
          .from('ssr_year')
          .select('base_rate')
          .eq('code', best.code)
          .eq('year', sorYear)
          .maybeSingle()

        if (yearRow) {
          return {
            resolvedCode: best.code,
            itemSource: 'SSR',
            categoryKey: 'ssr_item',
            unit: best.unit || originalUnit || 'CUM',
            itemDescription: best.description,
            publishedRate: yearRow?.base_rate ?? null,
            rate: undefined,
            hasRecipe: true,
            existsInSsr: true,
            resolutionType: 'description_similarity_match',
            candidates: candidates.map(c => ({ code: c.code, unit: c.unit })),
            note: `Fuzzy-matched SSR item ${best.code} based on description keywords`
          }
        }
      }
    }
  }



  // 3. Not found in SSR/SOR -> Classify safely as OTHERS (Custom / Non-SSR)
  return {
    resolvedCode: cleaned || rawCodeOrDescription || 'CUSTOM-ITEM',
    itemSource: 'OTHERS',
    categoryKey: 'custom',
    unit: originalUnit || 'CUM',
    itemDescription: rawCodeOrDescription || '',
    publishedRate: null,
    rate: originalRate != null ? Number(originalRate) : 0,
    hasRecipe: false,
    existsInSsr: false,
    resolutionType: 'custom_others',
    note: 'Non-SSR item (e.g. custom). Classified as OTHERS to preserve rate and prevent SSR lookup crashes.'
  }
}

/**
 * Search Supabase SSR Catalogue
 */
async function searchSsrItems({ query, limit = 10, sorYear = '2026-27' }) {
  if (!query) return []
  const cleanQ = query.trim()
  const isCode = /IRR-/i.test(cleanQ)

  let queryBuilder = supabase.from('ssr_item').select('code,description,unit').limit(limit)
  if (isCode) {
    queryBuilder = queryBuilder.ilike('code', `%${cleanQ}%`)
  } else {
    queryBuilder = queryBuilder.ilike('description', `%${cleanQ}%`)
  }

  const { data, error } = await queryBuilder
  if (error || !data) return []

  // Check recipes in parallel
  const codes = data.map(d => d.code)
  const { data: years } = await supabase
    .from('ssr_year')
    .select('code,base_rate')
    .eq('year', sorYear)
    .in('code', codes)

  const ratesByCode = new Map((years || []).map(y => [y.code, y.base_rate]))

  return data.map(item => ({
    code: item.code,
    description: item.description,
    unit: item.unit,
    sorYear,
    publishedRate: ratesByCode.get(item.code) ?? null,
    hasRecipe: ratesByCode.has(item.code)
  }))
}

/**
 * 1. Create a Project
 */
function createProject({ name, sorYear = '2026-27', location = null, projectPath }) {
  const p = tree.createDraftProject()
  p.meta.name = name
  p.meta.sorYear = sorYear
  let projLocation = null
  if (typeof location === 'string') {
    projLocation = { label: location, lat: null, lng: null }
  } else if (location && typeof location === 'object') {
    projLocation = location
  }
  p.meta.location = projLocation
  p.root.name = name

  // Seed standard front & intro pages
  const frontPage = tree.createNode('page', 'Front Cover', { pageTemplate: 'front' })
  const introPage = tree.createNode('page', 'General Abstract / Introduction', { pageTemplate: 'introduction' })
  p.root.children.push(frontPage, introPage)

  if (projectPath) {
    saveProject(p, projectPath)
  }
  return p
}

/**
 * 2. Create a Custom Component (or Sub-component)
 */
function createCustomComponent(project, { name, parentId = null, isSubcomponent = false, location = null, manualLengthM = null }) {
  const kind = isSubcomponent ? 'subcomponent' : 'component'
  const parent = parentId ? tree.findNode(project.root, parentId) : project.root
  if (!parent) throw new Error(`Parent node not found: ${parentId}`)

  const compNode = tree.createNode(kind, name, {
    location: location || project.meta.location,
    manualLengthM: manualLengthM ? Number(manualLengthM) : null
  })
  parent.children.push(compNode)
  project.updatedAt = new Date().toISOString()
  return compNode
}

/**
 * 3. Add Item to Component
 * Note: If itemSource is SSR and no manual rate is provided, leave rate undefined so SSR rate applies!
 */
function addItem(project, {
  componentId,
  name,
  itemCode,
  projectDataId = null,
  itemSource = 'SSR',
  categoryKey = 'ssr_item',
  itemDescription = '',
  unit = 'CUM',
  itemEditorType = 'spreadsheet',
  rate = null,
  computedQuantity = null,
  sorCatalogue = null
}) {
  const parent = tree.findNode(project.root, componentId)
  if (!parent) throw new Error(`Component not found: ${componentId}`)

  // Check if item links to a custom Project DATA
  let effectiveProjectDataId = projectDataId
  let effectiveItemSource = itemSource
  let effectiveCategoryKey = categoryKey
  let effectiveItemCode = itemCode || name
  let effectiveUnit = unit
  let effectiveDescription = itemDescription

  if (effectiveProjectDataId || (project.projectData && project.projectData.some(d => d.code === itemCode || d.id === itemCode))) {
    const dataDef = project.projectData.find(d => d.id === effectiveProjectDataId || d.code === itemCode || d.id === itemCode)
    if (dataDef) {
      effectiveProjectDataId = dataDef.id
      effectiveItemCode = dataDef.code
      effectiveItemSource = 'SSR'
      effectiveCategoryKey = 'project_data'
      effectiveUnit = dataDef.unit
      if (!effectiveDescription) effectiveDescription = dataDef.description
      rate = undefined // Let custom DATA recipe calculate the rate!
    }
  }

  if (sorCatalogue) {
    effectiveItemSource = 'SOR'
    effectiveCategoryKey = 'sor_catalogue'
  }

  const effectiveRate =
    rate !== undefined && rate !== null && rate !== ''
      ? Number(rate)
      : (effectiveItemSource === 'SSR' || effectiveItemSource === 'SOR' || effectiveCategoryKey === 'sor_catalogue' || effectiveCategoryKey === 'project_data')
        ? undefined
        : 0

  const itemNode = tree.createNode('item', name, {
    itemSource: effectiveItemSource,
    categoryKey: effectiveCategoryKey,
    itemCode: effectiveItemCode,
    projectDataId: effectiveProjectDataId || undefined,
    itemDescription: effectiveDescription,
    unit: effectiveUnit,
    itemEditorType,
    rate: effectiveRate,
    computedQuantity: computedQuantity != null ? Number(computedQuantity) : undefined,
    ...(sorCatalogue ? { sorCatalogue } : {})
  })

  if (effectiveRate === undefined) {
    delete itemNode.rate
  }

  // Initialize empty sheet if spreadsheet item
  if (itemEditorType === 'spreadsheet') {
    itemNode.spreadsheet = {
      sheetOrder: ['sheet1'],
      sheets: {
        sheet1: {
          id: 'sheet1',
          name: 'Measurements',
          cellData: {},
          rowCount: 50,
          columnCount: 15
        }
      }
    }
  }

  parent.children.push(itemNode)
  project.updatedAt = new Date().toISOString()
  return itemNode
}

/**
 * 4. Edit Item Excel / Set Cells & Formulas
 * Sanitizes #REF! formulas from legacy Excel errors.
 */
function editItemExcel(project, { itemId, cells = [], sheetId = null, finalCell = null }) {
  const itemNode = tree.findNode(project.root, itemId)
  if (!itemNode) throw new Error(`Item not found: ${itemId}`)
  if (itemNode.itemEditorType !== 'spreadsheet') throw new Error(`Item is not a spreadsheet editor: ${itemId}`)

  let snapshot = itemNode.spreadsheet
  if (!snapshot || !snapshot.sheets) {
    snapshot = {
      sheetOrder: ['sheet1'],
      sheets: {
        sheet1: { id: 'sheet1', name: 'Sheet1', cellData: {}, rowCount: 50, columnCount: 15 }
      }
    }
    itemNode.spreadsheet = snapshot
  }

  const targetSheetId = sheetId || snapshot.sheetOrder?.[0] || Object.keys(snapshot.sheets)[0]
  const sheet = snapshot.sheets[targetSheetId]
  if (!sheet) throw new Error(`Sheet not found: ${targetSheetId}`)
  if (!sheet.cellData) sheet.cellData = {}

  for (const cell of cells) {
    const r = String(cell.row)
    const c = String(cell.col)
    if (!sheet.cellData[r]) sheet.cellData[r] = {}
    const cellObj = sheet.cellData[r][c] || {}

    // Sanitize values
    if (cell.v !== undefined) {
      if (typeof cell.v === 'string' && (cell.v.includes('#REF!') || cell.v.includes('#VALUE!'))) {
        cellObj.v = null
      } else {
        cellObj.v = cell.v
      }
    }

    // Sanitize formulas
    if (cell.f !== undefined) {
      if (typeof cell.f === 'string' && cell.f.includes('#REF!')) {
        cellObj.f = undefined
        if (cellObj.v === undefined) cellObj.v = 0
      } else {
        cellObj.f = cell.f
      }
    }

    sheet.cellData[r][c] = cellObj
  }

  if (finalCell) {
    itemNode.finalCell = { row: Number(finalCell.row), column: Number(finalCell.column) }
  }

  // If this item is part of a shared sheet, sync changes to all members
  if (itemNode.sharedSheetId) {
    const members = sharedSheet.collectSharedMembers(project.root, itemNode.sharedSheetId)
    for (const member of members) {
      if (member.id !== itemNode.id) {
        member.spreadsheet = JSON.parse(JSON.stringify(snapshot))
      }
    }
  }

  project.updatedAt = new Date().toISOString()
  return itemNode
}

/**
 * 5. Make Excel in Multi-item (Shared Sheet Group)
 */
function makeMultiItemExcel(project, { itemIds = [], sharedSheetName = 'Shared Measurements' }) {
  if (!itemIds || itemIds.length === 0) throw new Error('itemIds must contain at least one item')

  const items = itemIds.map(id => {
    const node = tree.findNode(project.root, id)
    if (!node || node.kind !== 'item') throw new Error(`Item not found: ${id}`)
    return node
  })

  // Owner is the first item
  const owner = items[0]
  const sharedId = owner.sharedSheetId || tree.newId()

  // Make sure owner has a workbook
  if (!owner.spreadsheet) {
    owner.spreadsheet = {
      sheetOrder: ['sheet1'],
      sheets: {
        sheet1: { id: 'sheet1', name: sharedSheetName, cellData: {}, rowCount: 100, columnCount: 20 }
      }
    }
  }

  // Link all items to this shared sheet group and sync the spreadsheet
  const workbookCopy = JSON.parse(JSON.stringify(owner.spreadsheet))
  for (const item of items) {
    item.sharedSheetId = sharedId
    item.sharedSheetName = sharedSheetName
    item.spreadsheet = JSON.parse(JSON.stringify(workbookCopy))
  }

  project.updatedAt = new Date().toISOString()
  return { sharedSheetId: sharedId, sharedSheetName, memberCount: items.length }
}

/**
 * 6. Fix Final No.
 */
function fixFinalNumber(project, { itemId, cellRef = null, row = null, column = null, docOffset = null }) {
  const itemNode = tree.findNode(project.root, itemId)
  if (!itemNode) throw new Error(`Item not found: ${itemId}`)

  if (itemNode.itemEditorType === 'spreadsheet') {
    let r = row
    let c = column
    if (cellRef) {
      const parsed = itemCellRef.parseCellA1(cellRef)
      if (!parsed) throw new Error(`Invalid A1 cell reference: ${cellRef}`)
      r = parsed.row
      c = parsed.column
    }
    if (r == null || c == null) throw new Error('Must provide either cellRef (e.g. "C18") or row and column')

    itemNode.finalCell = { row: Number(r), column: Number(c) }

    // Also update computedQuantity if cell exists
    const firstSheetId = itemNode.spreadsheet?.sheetOrder?.[0]
    const sheet = itemNode.spreadsheet?.sheets?.[firstSheetId]
    const val = sheet?.cellData?.[r]?.[c]?.v
    if (typeof val === 'number') itemNode.computedQuantity = val
    else if (val) {
      const parsedVal = parseFloat(val)
      if (!isNaN(parsedVal)) itemNode.computedQuantity = parsedVal
    }

    project.updatedAt = new Date().toISOString()
    return { itemId, finalCell: itemNode.finalCell, resolvedQuantity: itemNode.computedQuantity }
  } else if (itemNode.itemEditorType === 'document') {
    if (!docOffset || docOffset.startIndex == null || docOffset.endIndex == null) {
      throw new Error('For document items, docOffset: { startIndex, endIndex, text } is required')
    }
    const fixed = documentFinal.createDocumentFinal(
      docOffset.startIndex,
      docOffset.endIndex,
      docOffset.text || ''
    )
    if (!fixed) throw new Error('Failed to parse a numeric value in document offset range')
    itemNode.documentFinal = fixed
    itemNode.computedQuantity = fixed.capturedValue

    project.updatedAt = new Date().toISOString()
    return { itemId, documentFinal: fixed, resolvedQuantity: fixed.capturedValue }
  }

  throw new Error(`Unsupported itemEditorType: ${itemNode.itemEditorType}`)
}

/**
 * 7. Set Print Area
 */
function setPrintArea(project, { itemId, rangeA1 = null, range = null, documentParagraphs = null, pageSize = 'A4', orientation = 'portrait' }) {
  const itemNode = tree.findNode(project.root, itemId)
  if (!itemNode) throw new Error(`Item not found: ${itemId}`)

  if (itemNode.itemEditorType === 'spreadsheet') {
    let targetRange = range
    if (rangeA1) {
      const parts = rangeA1.split(':')
      if (parts.length === 2) {
        const p1 = itemCellRef.parseCellA1(parts[0])
        const p2 = itemCellRef.parseCellA1(parts[1])
        if (p1 && p2) {
          targetRange = {
            startRow: Math.min(p1.row, p2.row),
            startColumn: Math.min(p1.column, p2.column),
            endRow: Math.max(p1.row, p2.row),
            endColumn: Math.max(p1.column, p2.column)
          }
        }
      }
    }

    if (!targetRange) throw new Error('Must provide valid range or rangeA1 (e.g. "A1:G30")')

    if (!itemNode.print) itemNode.print = {}
    itemNode.print.range = targetRange
    if (pageSize) itemNode.print.pageSize = pageSize
    if (orientation) itemNode.print.orientation = orientation

    // Sync to shared sheet members if applicable
    if (itemNode.sharedSheetId) {
      const members = sharedSheet.collectSharedMembers(project.root, itemNode.sharedSheetId)
      for (const m of members) {
        if (!m.print) m.print = {}
        m.print.range = targetRange
        m.print.pageSize = pageSize
        m.print.orientation = orientation
      }
    }

    project.updatedAt = new Date().toISOString()
    return { itemId, printRange: targetRange, pageSize, orientation }
  } else if (itemNode.itemEditorType === 'document') {
    if (!documentParagraphs || documentParagraphs.start == null || documentParagraphs.end == null) {
      throw new Error('For document items, documentParagraphs: { start, end } is required')
    }
    itemNode.documentPrintArea = {
      startParagraph: Number(documentParagraphs.start),
      endParagraph: Number(documentParagraphs.end)
    }
    project.updatedAt = new Date().toISOString()
    return { itemId, documentPrintArea: itemNode.documentPrintArea }
  }

  throw new Error(`Unsupported itemEditorType: ${itemNode.itemEditorType}`)
}

/**
 * 8. Lead Creation Tool
 */
function createLead(project, {
  materialName,
  sourceName,
  sourceLat,
  sourceLng,
  destinationName = null,
  destinationLat = null,
  destinationLng = null,
  leadKm = null,
  conveyanceClass = 'STONE',
  isAvgLead = false,
  avgLeadData = null
}) {
  if (!project.leadChart) {
    project.leadChart = { points: [], assignments: [], itemChoices: [], variants: [], applications: [] }
  }

  const pointId = tree.newId()
  const sourcePoint = {
    id: pointId,
    name: sourceName || `${materialName} Quarry`,
    lat: Number(sourceLat),
    lng: Number(sourceLng),
    kind: 'quarry'
  }
  project.leadChart.points.push(sourcePoint)

  const variantId = tree.newId()
  const variant = {
    id: variantId,
    pointId,
    materialName,
    conveyanceClass,
    leadKm: leadKm != null ? Number(leadKm) : 0,
    liftM: 0,
    isAvg: Boolean(isAvgLead),
    avgLead: avgLeadData || null
  }
  project.leadChart.variants.push(variant)

  project.updatedAt = new Date().toISOString()
  return { sourcePoint, variant }
}

/**
 * 9. Headless Cost Sync Orchestrator
 * Connects all items to Supabase recipes, computes published and custom rates,
 * rolls up quantities from measurement sheets, calculates GST and seigniorage,
 * and updates project.dashboardSnapshot.
 */
async function syncProjectCosts(project, { projectPath = null } = {}) {
  const ds = getDashboardSync()
  const items = ds.collectDashboardItems(project.root)
  if (items.length === 0) {
    return { message: 'No items in project to sync', totalCivilCost: 0 }
  }

  const snapshot = await ds.syncProjectDashboardSnapshot(project, items)
  project.dashboardSnapshot = snapshot
  project.updatedAt = new Date().toISOString()

  // Calculate totals
  const componentTotals = snapshot.componentTotals || {}
  const totalCivilCost = Object.values(componentTotals).reduce((sum, v) => sum + (Number(v) || 0), 0)
  const gstPercent = 18 // standard civil engineering GST
  const gstAmount = totalCivilCost * (gstPercent / 100)
  const totalWithGst = totalCivilCost + gstAmount

  if (projectPath) {
    saveProject(project, projectPath)
  }

  return {
    syncedItemCount: items.length,
    componentTotals,
    totalCivilCost,
    gstPercent,
    gstAmount,
    totalWithGst,
    projectRates: snapshot.projectRates
  }
}

/**
 * 10. Compute breakdown and rate for a Project DATA definition
 */
function computeDataBreakdown(definition) {
  if (definition.kind === 'sor') {
    const rate = Number(definition.rate) || 0
    return {
      kind: 'sor',
      rate,
      ratePerUnit: rate
    }
  }

  const resolvedSections = projectDataLib.resolveProjectSsrSections(definition.sections || [])
  const sectionTotals = {}
  for (const s of resolvedSections) {
    sectionTotals[s.key] = s.lines.reduce((tot, l) => tot + (Number(l.amount) || 0), 0)
  }
  const materials = sectionTotals.materials || 0
  const machinery = sectionTotals.machinery || 0
  const labour = sectionTotals.labour || 0
  const subtotal = materials + machinery + labour
  const overheadPct = Number(definition.overheadPercent) || 0
  const overheadAmount = (subtotal * overheadPct) / 100
  const totalCost = subtotal + overheadAmount
  const outputQty = Math.max(Number(definition.outputQuantity) || 1, 0.000001)
  const ratePerUnit = totalCost / outputQty

  return {
    kind: 'ssr',
    outputQuantity: outputQty,
    overheadPercent: overheadPct,
    materialsTotal: Math.round(materials * 100) / 100,
    machineryTotal: Math.round(machinery * 100) / 100,
    labourTotal: Math.round(labour * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    overheadAmount: Math.round(overheadAmount * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    ratePerUnit: Math.round(ratePerUnit * 100) / 100
  }
}

/**
 * Clone an existing published SSR recipe from Supabase into a ProjectSsrDataDraft
 */
async function cloneSsrToDataDraft(sourceItemCode, sorYear = '2026-27') {
  const code = cleanSsrCode(sourceItemCode)
  const { data: item } = await supabase
    .from('ssr_item')
    .select('code,description,unit,materials,machinery,labour,quantity')
    .eq('code', code)
    .maybeSingle()

  if (!item) throw new Error(`SSR item not found in Supabase for code: ${code}`)

  const { data: yearRow } = await supabase
    .from('ssr_year')
    .select('rates,totals,base_rate')
    .eq('code', code)
    .eq('year', sorYear)
    .maybeSingle()

  const storedRates = yearRow?.rates || {}
  const sections = [
    { key: 'materials', label: 'A. Materials', lines: [] },
    { key: 'machinery', label: 'B. Machinery', lines: [] },
    { key: 'labour', label: 'C. Labour', lines: [] }
  ]

  for (const s of sections) {
    const rawList = storedRates[s.key] || item[s.key] || []
    if (Array.isArray(rawList)) {
      s.lines = rawList.map(r => ({
        description: r.description || r.name || '',
        unit: r.unit || '',
        quantity: Number(r.quantity) || 0,
        rate: Number(r.rate) || 0,
        amount: Math.round((Number(r.quantity) || 0) * (Number(r.rate) || 0) * 100) / 100,
        seigniorageApplicable: Boolean(r.seigniorage_code || r.seigniorageApplicable),
        seigniorageCode: r.seigniorage_code || r.seigniorageCode
      }))
    }
  }

  return {
    description: item.description,
    unit: item.unit || 'CUM',
    outputQuantity: Number(item.quantity) || 1,
    overheadPercent: 14,
    sourceItemCode: item.code,
    rateSource: { itemSource: 'SSR', itemCode: item.code, categoryKey: 'ssr_item' },
    sections
  }
}

/**
 * 11. Create a Project DATA Definition
 */
async function createProjectData(project, {
  kind = 'ssr',
  code = null,
  description,
  unit = 'CUM',
  rate = 0,
  outputQuantity = 1,
  overheadPercent = 14,
  sourceItemCode = null,
  sections = null,
  lead = null,
  timelyRates = false,
  projectPath = null
}) {
  if (!project.projectData) project.projectData = []

  const now = new Date().toISOString()
  const dataId = tree.newId()
  const dataCode = code || projectDataDefaults.nextProjectDataCode(project.projectData)

  let baseDraft = null
  if (sourceItemCode) {
    baseDraft = await cloneSsrToDataDraft(sourceItemCode, project.meta.sorYear || '2026-27')
  }

  let finalSections = []
  if (kind === 'ssr') {
    if (sections && Array.isArray(sections)) {
      finalSections = sections.map(s => {
        const rawLines = s.lines || s.items || []
        return {
          key: s.key,
          label: s.label || s.title || (s.key === 'materials' ? 'A. Materials' : s.key === 'machinery' ? 'B. Machinery' : 'C. Labour'),
          lines: rawLines.map(l => ({
            description: l.description,
            unit: l.unit || 'Nos',
            quantity: Number(l.quantity) || 0,
            rate: Number(l.rate) || 0,
            amount: Math.round((Number(l.quantity) || 0) * (Number(l.rate) || 0) * 100) / 100,
            rateFormula: l.rateFormula || l.formulaRate,
            seigniorageApplicable: Boolean(l.seigniorageApplicable),
            seigniorageCode: l.seigniorageCode,
            lead: l.lead
          }))
        }
      })
    } else if (baseDraft) {
      finalSections = baseDraft.sections
    } else {
      finalSections = [
        { key: 'materials', label: 'A. Materials', lines: [] },
        { key: 'machinery', label: 'B. Machinery', lines: [] },
        { key: 'labour', label: 'C. Labour', lines: [] }
      ]
    }
  }

  const definition = {
    id: dataId,
    code: dataCode,
    kind,
    description: description || baseDraft?.description || 'Custom Project DATA',
    unit: unit || baseDraft?.unit || 'CUM',
    timelyRates: Boolean(timelyRates),
    createdAt: now,
    updatedAt: now
  }

  if (kind === 'sor') {
    definition.rate = Number(rate) || 0
  } else {
    definition.outputQuantity = Number(outputQuantity) || baseDraft?.outputQuantity || 1
    definition.overheadPercent = overheadPercent != null ? Number(overheadPercent) : baseDraft?.overheadPercent || 14
    definition.sections = finalSections
    definition.lead = lead || { applicable: false }
    if (baseDraft?.rateSource) {
      definition.rateSource = baseDraft.rateSource
    }
  }

  const breakdown = computeDataBreakdown(definition)
  definition.calculatedRate = breakdown.ratePerUnit

  project.projectData.push(definition)
  project.updatedAt = now

  if (projectPath) {
    saveProject(project, projectPath)
  }

  return { definition, breakdown }
}

/**
 * 12. Edit an Existing Project DATA Definition
 */
function editProjectData(project, {
  dataIdOrCode,
  description,
  unit,
  rate,
  outputQuantity,
  overheadPercent,
  lead,
  timelyRates,
  replaceSections,
  addLines,
  updateLines,
  removeLines,
  projectPath = null
}) {
  if (!project.projectData) project.projectData = []
  const def = project.projectData.find(d => d.id === dataIdOrCode || d.code === dataIdOrCode)
  if (!def) throw new Error(`Project DATA not found for: ${dataIdOrCode}`)

  const now = new Date().toISOString()
  if (description !== undefined) def.description = description
  if (unit !== undefined) def.unit = unit
  if (timelyRates !== undefined) def.timelyRates = Boolean(timelyRates)
  if (lead !== undefined) def.lead = lead

  if (def.kind === 'sor') {
    if (rate !== undefined) def.rate = Number(rate) || 0
  } else {
    if (outputQuantity !== undefined) def.outputQuantity = Number(outputQuantity) || 1
    if (overheadPercent !== undefined) def.overheadPercent = Number(overheadPercent) || 0

    if (replaceSections && Array.isArray(replaceSections)) {
      def.sections = replaceSections
    } else {
      if (!def.sections) {
        def.sections = [
          { key: 'materials', label: 'A. Materials', lines: [] },
          { key: 'machinery', label: 'B. Machinery', lines: [] },
          { key: 'labour', label: 'C. Labour', lines: [] }
        ]
      }

      // Handle addLines (flat or nested line object)
      if (addLines && Array.isArray(addLines)) {
        for (const item of addLines) {
          const sKey = item.sectionKey || item.section || item.key
          const sec = def.sections.find(s => s.key === sKey)
          const lineData = item.line || item
          if (sec && lineData) {
            sec.lines.push({
              description: lineData.description,
              unit: lineData.unit || 'Nos',
              quantity: Number(lineData.quantity) || 0,
              rate: Number(lineData.rate) || 0,
              amount: Math.round((Number(lineData.quantity) || 0) * (Number(lineData.rate) || 0) * 100) / 100,
              rateFormula: lineData.rateFormula || lineData.formulaRate,
              seigniorageApplicable: Boolean(lineData.seigniorageApplicable),
              seigniorageCode: lineData.seigniorageCode,
              lead: lineData.lead
            })
          }
        }
      }

      // Handle updateLines (flat patch or nested patch object)
      if (updateLines && Array.isArray(updateLines)) {
        for (const ul of updateLines) {
          const sKey = ul.sectionKey || ul.section || ul.key
          const sec = def.sections.find(s => s.key === sKey)
          if (sec) {
            let targetLine = null
            if (ul.lineIndex !== undefined && sec.lines[ul.lineIndex]) {
              targetLine = sec.lines[ul.lineIndex]
            } else {
              const query = ul.descriptionQuery || ul.lineDescription || ul.description
              if (query) {
                targetLine = sec.lines.find(l => l.description && l.description.toLowerCase().includes(query.toLowerCase()))
              }
            }
            if (targetLine) {
              const patch = ul.patch || ul
              if (patch.description !== undefined && patch.description !== targetLine.description) targetLine.description = patch.description
              if (patch.unit !== undefined) targetLine.unit = patch.unit
              if (patch.quantity !== undefined) targetLine.quantity = Number(patch.quantity)
              if (patch.rate !== undefined) targetLine.rate = Number(patch.rate)
              if (patch.rateFormula !== undefined || patch.formulaRate !== undefined) targetLine.rateFormula = patch.rateFormula || patch.formulaRate
              if (patch.seigniorageApplicable !== undefined) targetLine.seigniorageApplicable = Boolean(patch.seigniorageApplicable)
              if (patch.seigniorageCode !== undefined) targetLine.seigniorageCode = patch.seigniorageCode
              if (patch.lead !== undefined) targetLine.lead = patch.lead

              targetLine.amount = Math.round(Number(targetLine.quantity || 0) * Number(targetLine.rate || 0) * 100) / 100
            }
          }
        }
      }

      // Handle removeLines
      if (removeLines && Array.isArray(removeLines)) {
        for (const rl of removeLines) {
          const sKey = rl.sectionKey || rl.section || rl.key
          const sec = def.sections.find(s => s.key === sKey)
          if (sec) {
            if (rl.lineIndex !== undefined) {
              sec.lines.splice(rl.lineIndex, 1)
            } else {
              const query = rl.descriptionQuery || rl.lineDescription || rl.description
              if (query) {
                const idx = sec.lines.findIndex(l => l.description && l.description.toLowerCase().includes(query.toLowerCase()))
                if (idx !== -1) sec.lines.splice(idx, 1)
              }
            }
          }
        }
      }
    }
  }

  def.updatedAt = now
  const breakdown = computeDataBreakdown(def)
  def.calculatedRate = breakdown.ratePerUnit

  project.updatedAt = now
  if (projectPath) {
    saveProject(project, projectPath)
  }

  return { definition: def, breakdown }
}

/**
 * 13. List all Project DATA definitions
 */
function listProjectData(project) {
  const definitions = project.projectData || []
  const allItems = []
  function visit(node) {
    if (node.kind === 'item') allItems.push(node)
    if (node.children) node.children.forEach(visit)
  }
  if (project.root) visit(project.root)

  return definitions.map(def => {
    const usages = allItems.filter(item => item.projectDataId === def.id || item.itemCode === def.code)
    const breakdown = computeDataBreakdown(def)
    return {
      id: def.id,
      code: def.code,
      kind: def.kind,
      description: def.description,
      unit: def.unit,
      calculatedRate: breakdown.ratePerUnit,
      usageCount: usages.length,
      usages: usages.map(u => ({ id: u.id, name: u.name, qty: u.computedQuantity }))
    }
  })
}

/**
 * 14. Get details of a Project DATA definition
 */
function getProjectData(project, dataIdOrCode) {
  const def = (project.projectData || []).find(d => d.id === dataIdOrCode || d.code === dataIdOrCode)
  if (!def) throw new Error(`Project DATA not found for: ${dataIdOrCode}`)
  const breakdown = computeDataBreakdown(def)
  return { definition: def, breakdown }
}

module.exports = {
  loadProject,
  saveProject,
  cleanSsrCode,
  resolveItem,
  searchSsrItems,
  createProject,
  createCustomComponent,
  addItem,
  editItemExcel,
  makeMultiItemExcel,
  fixFinalNumber,
  setPrintArea,
  createLead,
  syncProjectCosts,
  computeDataBreakdown,
  cloneSsrToDataDraft,
  createProjectData,
  editProjectData,
  listProjectData,
  getProjectData
}
