#!/usr/bin/env node
/**
 * Model Context Protocol (MCP) Server for E-Estimate.
 * Exposes native estimate creation, Supabase SSR item resolution & search,
 * custom components, item spreadsheets, multi-item shared workbooks,
 * final quantity pinning, print areas, leads, and cost sync orchestration to Agentic AIs.
 */
const { Server } = require('@modelcontextprotocol/sdk/server/index.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const {
  CallToolRequestSchema,
  ListToolsRequestSchema
} = require('@modelcontextprotocol/sdk/types.js')
const fs = require('node:fs')
const path = require('node:path')
const ops = require('./estimate-core-ops.cjs')
const converter = require('./excel-to-eestimate.cjs')

const server = new Server(
  {
    name: 'e-estimate-mcp-server',
    version: '1.1.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
)

// Active in-memory session or file cache
let activeProject = null
let activeProjectPath = null

function ensureProject(specifiedPath) {
  const pPath = specifiedPath || activeProjectPath
  if (!pPath) {
    if (activeProject) return { project: activeProject, path: null }
    throw new Error('No active project. Call create_project or load_project first, or supply projectPath.')
  }
  if (!activeProject || activeProjectPath !== pPath) {
    if (fs.existsSync(pPath)) {
      activeProject = ops.loadProject(pPath)
      activeProjectPath = pPath
    } else if (!activeProject) {
      throw new Error(`Project file not found at ${pPath}`)
    }
  }
  return { project: activeProject, path: pPath }
}

function persistIfPath(pPath) {
  if (pPath && activeProject) {
    ops.saveProject(activeProject, pPath)
  }
}

// ---------------- Tool Definitions ----------------
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_ssr_items',
        description: 'Searches the Supabase SSR database by keyword, description, or code prefix. Returns matching items with units, descriptions, and 2026-27 published rates.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (e.g. "vibrated M-15", "murrum", "excavation", "IRR-CCDW")' },
            limit: { type: 'number', description: 'Max items to return (default 10)', default: 10 },
            sorYear: { type: 'string', description: 'SOR schedule year (default "2026-27")', default: '2026-27' }
          },
          required: ['query']
        }
      },
      {
        name: 'resolve_item',
        description: 'Intelligently resolves any raw/messy engineering item string (e.g. "IRR-CCDW-2-25 & MORTH 21.07 (Page 784)") against Supabase ssr_item and ssr_year. Detects canonical codes, verifies recipe availability, handles unit conversions (KG -> TONNE), and safely flags non-SSR items as OTHERS.',
        inputSchema: {
          type: 'object',
          properties: {
            rawCodeOrDescription: { type: 'string', description: 'Raw code, description, or reference string from legacy Excel or user input' },
            sorYear: { type: 'string', description: 'Target SOR year (default "2026-27")', default: '2026-27' },
            originalRate: { type: 'number', description: 'Original rate from legacy estimate' },
            originalUnit: { type: 'string', description: 'Original unit (e.g. "Kg", "Rmt", "Cum")' }
          },
          required: ['rawCodeOrDescription']
        }
      },
      {
        name: 'create_project',
        description: 'Creates a new E-Estimate civil engineering project file (.eestimate) with initial Front Cover and Introduction pages.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the irrigation / infrastructure project (e.g. MKLIS Package 29)' },
            sorYear: { type: 'string', description: 'Applicable SOR / SSR schedule year (e.g. "2026-27")', default: '2026-27' },
            location: { type: 'string', description: 'Geographic location / district / mandal' },
            projectPath: { type: 'string', description: 'Destination absolute or relative path to save the .eestimate file' }
          },
          required: ['name', 'projectPath']
        }
      },
      {
        name: 'load_project',
        description: 'Loads an existing .eestimate project into the active MCP session.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string', description: 'Path to the existing .eestimate project file' }
          },
          required: ['projectPath']
        }
      },
      {
        name: 'create_custom_component',
        description: 'Creates a Custom Component or Sub-component (e.g. Main Canal, Forebay, Cistern, Pumphouse, Retaining Wall) in the project tree.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Component name' },
            parentId: { type: 'string', description: 'Optional parent component ID (if creating a sub-component)' },
            isSubcomponent: { type: 'boolean', description: 'Whether this node is a sub-component (defaults to false)' },
            manualLengthM: { type: 'number', description: 'Optional civil work alignment length in metres' },
            projectPath: { type: 'string', description: 'Optional project file path' }
          },
          required: ['name']
        }
      },
      {
        name: 'add_item_to_component',
        description: 'Adds an item to a Component. Automatically resolves messy codes against Supabase SSR when autoResolve is true, or accepts explicit item properties.',
        inputSchema: {
          type: 'object',
          properties: {
            componentId: { type: 'string', description: 'ID of the parent component' },
            name: { type: 'string', description: 'Item name or brief title' },
            itemCode: { type: 'string', description: 'Standard SSR/SOR code or messy code' },
            autoResolve: { type: 'boolean', description: 'Whether to automatically resolve code against Supabase ssr_item (default true)', default: true },
            itemSource: { type: 'string', enum: ['SSR', 'SOR', 'OTHERS'], default: 'SSR' },
            categoryKey: { type: 'string', default: 'ssr_item' },
            itemDescription: { type: 'string', description: 'Full engineering specification description' },
            unit: { type: 'string', description: 'Measurement unit (e.g. "CUM", "SQM", "TONNE", "Rmt")' },
            rate: { type: 'number', description: 'Rate per unit in INR (omit for SSR to use official recipe rate)' },
            computedQuantity: { type: 'number', description: 'Initial or fixed quantity' },
            itemEditorType: { type: 'string', enum: ['spreadsheet', 'document'], default: 'spreadsheet' },
            projectPath: { type: 'string', description: 'Optional project file path' }
          },
          required: ['componentId', 'name']
        }
      },
      {
        name: 'edit_item_excel',
        description: 'Populates measurement rows, columns, and formulas in an Item\'s spreadsheet. Sanitizes #REF! formulas from legacy Excel errors.',
        inputSchema: {
          type: 'object',
          properties: {
            itemId: { type: 'string', description: 'ID of the item node' },
            cells: {
              type: 'array',
              description: 'Array of cell objects to write. e.g. [{ row: 0, col: 0, v: "Chainage" }, { row: 1, col: 2, v: 450, f: "=A2*B2" }]',
              items: {
                type: 'object',
                properties: {
                  row: { type: 'number', description: '0-based row index' },
                  col: { type: 'number', description: '0-based column index' },
                  v: { description: 'Cell value (string, number, or boolean)' },
                  f: { type: 'string', description: 'Excel formula (e.g. "=SUM(C2:C10)")' }
                },
                required: ['row', 'col']
              }
            },
            finalCell: {
              type: 'object',
              description: 'Optional final total cell coordinate { row, column } to pin as item total quantity',
              properties: {
                row: { type: 'number' },
                column: { type: 'number' }
              }
            },
            projectPath: { type: 'string', description: 'Optional project file path' }
          },
          required: ['itemId', 'cells']
        }
      },
      {
        name: 'make_multi_item_excel',
        description: 'Binds multiple items into a single Multi-Item Shared Workbook (e.g. Combined Measurement Book).',
        inputSchema: {
          type: 'object',
          properties: {
            itemIds: {
              type: 'array',
              description: 'List of item IDs to link into the shared workbook',
              items: { type: 'string' }
            },
            sharedSheetName: { type: 'string', description: 'Display name of the combined measurement sheet', default: 'Combined Measurement Book' },
            projectPath: { type: 'string', description: 'Optional project file path' }
          },
          required: ['itemIds']
        }
      },
      {
        name: 'fix_final_number',
        description: 'Fixes / Pins the final measurement total quantity for an item so it rolls up accurately into the project abstract.',
        inputSchema: {
          type: 'object',
          properties: {
            itemId: { type: 'string', description: 'ID of the item node' },
            cellRef: { type: 'string', description: 'Cell reference in A1 format (e.g. "C18", "D25") for spreadsheet items' },
            row: { type: 'number', description: '0-based row index (alternative to cellRef)' },
            column: { type: 'number', description: '0-based column index (alternative to cellRef)' },
            docOffset: {
              type: 'object',
              description: 'Character offset span for document-type items',
              properties: {
                startIndex: { type: 'number' },
                endIndex: { type: 'number' },
                text: { type: 'string' }
              }
            },
            projectPath: { type: 'string', description: 'Optional project file path' }
          },
          required: ['itemId']
        }
      },
      {
        name: 'set_print_area',
        description: 'Sets the printable page area, paper size, and orientation for an item\'s detailed measurement sheet.',
        inputSchema: {
          type: 'object',
          properties: {
            itemId: { type: 'string', description: 'ID of the item node' },
            rangeA1: { type: 'string', description: 'Excel range in A1 format (e.g. "A1:G40")' },
            range: {
              type: 'object',
              description: 'Explicit cell range',
              properties: {
                startRow: { type: 'number' },
                startColumn: { type: 'number' },
                endRow: { type: 'number' },
                endColumn: { type: 'number' }
              }
            },
            pageSize: { type: 'string', enum: ['A4', 'A3', 'A2', 'Letter', 'Legal'], default: 'A4' },
            orientation: { type: 'string', enum: ['portrait', 'landscape'], default: 'portrait' },
            projectPath: { type: 'string', description: 'Optional project file path' }
          },
          required: ['itemId']
        }
      },
      {
        name: 'create_lead',
        description: 'Creates a Lead Source / Quarry point and Lead Variant for materials (Sand, Metal, Gravel, Cement, Steel).',
        inputSchema: {
          type: 'object',
          properties: {
            materialName: { type: 'string', description: 'Material name (e.g. "Sand", "Coarse Aggregate 40mm", "Rough Stone")' },
            sourceName: { type: 'string', description: 'Quarry or source name (e.g. "Krishna River Bed Quarry Reach 2")' },
            sourceLat: { type: 'number', description: 'Quarry Latitude' },
            sourceLng: { type: 'number', description: 'Quarry Longitude' },
            leadKm: { type: 'number', description: 'Lead distance in kilometres' },
            conveyanceClass: { type: 'string', enum: ['EARTH', 'STONE', 'CEMENT', 'STEEL', 'SLAB_WOOD', 'WATER', 'BRICKS', 'RCC_PIPE'], default: 'STONE' },
            isAvgLead: { type: 'boolean', description: 'Whether this lead uses multiple alignment points to calculate an average lead distance' },
            projectPath: { type: 'string', description: 'Optional project file path' }
          },
          required: ['materialName', 'sourceName', 'sourceLat', 'sourceLng', 'leadKm']
        }
      },
      {
        name: 'sync_project_costs',
        description: 'Orchestrates complete project cost calculation. Connects to Supabase to fetch authoritative DATA recipes, computes rates, rolls up quantities, calculates GST and seigniorage, and updates dashboardSnapshot.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string', description: 'Optional project file path' }
          }
        }
      },
      {
        name: 'import_excel_to_project',
        description: 'Intelligently imports an engineering estimate Excel folder into a fully resolved .eestimate file. Resolves SSR item codes, filters #REF! formulas, links shared measurement sheets, and orchestrates cost sync.',
        inputSchema: {
          type: 'object',
          properties: {
            inputDir: { type: 'string', description: 'Directory containing .xls / .xlsx estimate files' },
            outputPath: { type: 'string', description: 'Destination .eestimate file path' },
            projectName: { type: 'string', description: 'Project title' },
            sorYear: { type: 'string', description: 'Target SOR year (default "2026-27")', default: '2026-27' }
          },
          required: ['inputDir', 'outputPath']
        }
      },
      {
        name: 'get_project_tree',
        description: 'Returns the hierarchy of components, sub-components, items, quantities, and rates in the project.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string', description: 'Optional project file path' }
          }
        }
      },
      {
        name: 'create_project_data',
        description: 'Creates a custom Project DATA recipe (Rate Analysis). Supports kind="ssr" (multi-section: materials, machinery, labour, contractor overhead, dynamic formula lines like "=A*0.05") or kind="sor" (flat rate). Can clone from published SSR items via sourceItemCode or build from scratch. Automatically evaluates line formulas, calculates unit rate, and links to project cost calculation.',
        inputSchema: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['ssr', 'sor'], default: 'ssr', description: 'Recipe kind: "ssr" (detailed breakdown) or "sor" (flat rate)' },
            code: { type: 'string', description: 'Unique DATA code (e.g. "DATA-M20-CUSTOM", "DATA-CANAL-LINING"). Defaults to auto-generated "DATA-SOR-xxx"' },
            description: { type: 'string', description: 'Civil engineering specification description of the DATA item' },
            unit: { type: 'string', description: 'Unit of measurement (e.g. "CUM", "SQM", "MT", "RM", "NO")', default: 'CUM' },
            outputQuantity: { type: 'number', description: 'Output quantity batch size (e.g. 10 CUM). Unit rate = total cost / outputQuantity', default: 1 },
            overheadPercent: { type: 'number', description: 'Contractor overhead & profit percentage (e.g. 14 for 14%)', default: 14 },
            sourceItemCode: { type: 'string', description: 'Optional standard SSR code to clone recipe from (e.g. "IRR-CCDW-2-29")' },
            sections: {
              type: 'array',
              description: 'Sections array for custom SSR recipe. Each section has { key, title, items: [{ description, quantity, unit, rate, formulaRate }] }',
              items: { type: 'object' }
            },
            rate: { type: 'number', description: 'Direct rate (for SOR kind) or base rate override' },
            lead: {
              type: 'object',
              description: 'Optional lead applicability flags (e.g. { sand: true, aggregate: true })'
            },
            projectPath: { type: 'string', description: 'Optional project file path' }
          },
          required: ['description']
        }
      },
      {
        name: 'edit_project_data',
        description: 'Edits an existing Project DATA definition. Supports updating description, unit, rate, overhead %, outputQuantity, adding lines, updating lines by index or description search, removing lines, or replacing entire sections. Automatically re-evaluates formulas and recalculates the unit rate.',
        inputSchema: {
          type: 'object',
          properties: {
            dataIdOrCode: { type: 'string', description: 'ID (n_xxx) or code (e.g. "DATA-M20-CUSTOM") of the Project DATA definition to edit' },
            description: { type: 'string', description: 'Updated specification description' },
            unit: { type: 'string', description: 'Updated unit of measurement' },
            rate: { type: 'number', description: 'Updated direct rate (for SOR kind)' },
            overheadPercent: { type: 'number', description: 'Updated contractor overhead %' },
            outputQuantity: { type: 'number', description: 'Updated output batch quantity' },
            addLines: {
              type: 'array',
              description: 'Lines to add: array of { sectionKey: "materials"|"machinery"|"labour"|"overhead", description, quantity, unit, rate, formulaRate }',
              items: { type: 'object' }
            },
            updateLines: {
              type: 'array',
              description: 'Lines to update: array of { sectionKey, lineIndex (or descriptionQuery), description?, quantity?, unit?, rate?, formulaRate? }',
              items: { type: 'object' }
            },
            removeLines: {
              type: 'array',
              description: 'Lines to remove: array of { sectionKey, lineIndex (or descriptionQuery) }',
              items: { type: 'object' }
            },
            replaceSections: {
              type: 'array',
              description: 'Optional replacement of all sections'
            },
            projectPath: { type: 'string', description: 'Optional project file path' }
          },
          required: ['dataIdOrCode']
        }
      },
      {
        name: 'list_project_data',
        description: 'Lists all Project DATA recipes in the project, returning their IDs, codes, descriptions, units, calculated rates, kind (ssr/sor), overhead %, and tree usage count.',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string', description: 'Optional project file path' }
          }
        }
      },
      {
        name: 'get_project_data',
        description: 'Retrieves complete breakdown of a Project DATA recipe, including all sections (materials, machinery, labour, overheads), formula lines, quantities, rates, sub-totals, overhead %, and computed unit rate.',
        inputSchema: {
          type: 'object',
          properties: {
            dataIdOrCode: { type: 'string', description: 'ID or code of the Project DATA definition' },
            projectPath: { type: 'string', description: 'Optional project file path' }
          },
          required: ['dataIdOrCode']
        }
      }
    ]
  }
})

// ---------------- Tool Handlers ----------------
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'search_ssr_items': {
        const results = await ops.searchSsrItems({
          query: args.query,
          limit: args.limit || 10,
          sorYear: args.sorYear || '2026-27'
        })
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ status: 'success', count: results.length, items: results }, null, 2)
          }]
        }
      }

      case 'resolve_item': {
        const resolved = await ops.resolveItem({
          rawCodeOrDescription: args.rawCodeOrDescription,
          sorYear: args.sorYear || '2026-27',
          originalRate: args.originalRate,
          originalUnit: args.originalUnit
        })
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ status: 'success', resolution: resolved }, null, 2)
          }]
        }
      }

      case 'create_project': {
        const p = ops.createProject({
          name: args.name,
          sorYear: args.sorYear || '2026-27',
          location: args.location || null,
          projectPath: args.projectPath
        })
        activeProject = p
        activeProjectPath = args.projectPath
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `Created project "${args.name}" at ${args.projectPath}`,
              projectId: p.id,
              rootId: p.root.id
            }, null, 2)
          }]
        }
      }

      case 'load_project': {
        activeProject = ops.loadProject(args.projectPath)
        activeProjectPath = args.projectPath
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `Loaded project "${activeProject.meta.name}" from ${args.projectPath}`,
              componentCount: activeProject.root.children.filter(c => c.kind === 'component').length
            }, null, 2)
          }]
        }
      }

      case 'create_custom_component': {
        const { project, path: pPath } = ensureProject(args.projectPath)
        const comp = ops.createCustomComponent(project, {
          name: args.name,
          parentId: args.parentId,
          isSubcomponent: args.isSubcomponent,
          manualLengthM: args.manualLengthM
        })
        persistIfPath(pPath)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `Created ${comp.kind} "${comp.name}"`,
              componentId: comp.id
            }, null, 2)
          }]
        }
      }

      case 'add_item_to_component': {
        const { project, path: pPath } = ensureProject(args.projectPath)
        let itemCode = args.itemCode
        let itemSource = args.itemSource || 'SSR'
        let categoryKey = args.categoryKey || 'ssr_item'
        let itemDescription = args.itemDescription
        let unit = args.unit
        let rate = args.rate

        if (args.autoResolve !== false && itemCode) {
          const res = await ops.resolveItem({
            rawCodeOrDescription: itemCode,
            sorYear: project.meta.sorYear || '2026-27',
            originalRate: args.rate,
            originalUnit: args.unit
          })
          itemCode = res.resolvedCode
          itemSource = res.itemSource
          categoryKey = res.categoryKey
          if (!itemDescription) itemDescription = res.itemDescription
          if (!unit) unit = res.unit
          if (res.rate !== undefined) rate = res.rate
        }

        const item = ops.addItem(project, {
          componentId: args.componentId,
          name: args.name,
          itemCode,
          itemSource,
          categoryKey,
          itemDescription,
          unit,
          rate,
          computedQuantity: args.computedQuantity,
          itemEditorType: args.itemEditorType
        })
        persistIfPath(pPath)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `Added item "${item.name}" [${item.itemCode}] (${item.itemSource})`,
              itemId: item.id,
              item: {
                id: item.id,
                name: item.name,
                itemCode: item.itemCode,
                itemSource: item.itemSource,
                categoryKey: item.categoryKey,
                projectDataId: item.projectDataId,
                unit: item.unit,
                rate: item.rate
              }
            }, null, 2)
          }]
        }
      }

      case 'edit_item_excel': {
        const { project, path: pPath } = ensureProject(args.projectPath)
        const item = ops.editItemExcel(project, {
          itemId: args.itemId,
          cells: args.cells,
          finalCell: args.finalCell
        })
        persistIfPath(pPath)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `Updated Excel workbook for item "${item.name}" (${args.cells.length} cells written)`
            }, null, 2)
          }]
        }
      }

      case 'make_multi_item_excel': {
        const { project, path: pPath } = ensureProject(args.projectPath)
        const res = ops.makeMultiItemExcel(project, {
          itemIds: args.itemIds,
          sharedSheetName: args.sharedSheetName
        })
        persistIfPath(pPath)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `Linked ${res.memberCount} items into shared workbook "${res.sharedSheetName}"`,
              sharedSheetId: res.sharedSheetId,
              memberCount: res.memberCount
            }, null, 2)
          }]
        }
      }

      case 'fix_final_number': {
        const { project, path: pPath } = ensureProject(args.projectPath)
        const res = ops.fixFinalNumber(project, {
          itemId: args.itemId,
          cellRef: args.cellRef,
          row: args.row,
          column: args.column,
          docOffset: args.docOffset
        })
        persistIfPath(pPath)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `Fixed final quantity for item: ${res.resolvedQuantity}`,
              result: res
            }, null, 2)
          }]
        }
      }

      case 'set_print_area': {
        const { project, path: pPath } = ensureProject(args.projectPath)
        const res = ops.setPrintArea(project, {
          itemId: args.itemId,
          rangeA1: args.rangeA1,
          range: args.range,
          pageSize: args.pageSize,
          orientation: args.orientation
        })
        persistIfPath(pPath)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `Print area set for item ${args.itemId}`,
              result: res
            }, null, 2)
          }]
        }
      }

      case 'create_lead': {
        const { project, path: pPath } = ensureProject(args.projectPath)
        const res = ops.createLead(project, {
          materialName: args.materialName,
          sourceName: args.sourceName,
          sourceLat: args.sourceLat,
          sourceLng: args.sourceLng,
          leadKm: args.leadKm,
          conveyanceClass: args.conveyanceClass,
          isAvgLead: args.isAvgLead
        })
        persistIfPath(pPath)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `Created lead for ${args.materialName} (${args.leadKm} km from ${args.sourceName})`,
              sourcePointId: res.sourcePoint.id,
              variantId: res.variant.id
            }, null, 2)
          }]
        }
      }

      case 'sync_project_costs': {
        const { project, path: pPath } = ensureProject(args.projectPath)
        const res = await ops.syncProjectCosts(project, { projectPath: pPath })
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `Cost sync completed for ${res.syncedItemCount} items`,
              summary: res
            }, null, 2)
          }]
        }
      }

      case 'import_excel_to_project': {
        const { project, syncResult } = await converter.convertLm1ToEestimate({
          inputDir: args.inputDir,
          outputPath: args.outputPath,
          projectName: args.projectName || path.basename(args.inputDir),
          sorYear: args.sorYear || '2026-27'
        })
        activeProject = project
        activeProjectPath = args.outputPath
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `Imported and synced project "${project.meta.name}"`,
              outputPath: args.outputPath,
              summary: syncResult
            }, null, 2)
          }]
        }
      }

      case 'get_project_tree': {
        const { project } = ensureProject(args?.projectPath)
        function summarize(node) {
          return {
            id: node.id,
            name: node.name,
            kind: node.kind,
            itemCode: node.itemCode,
            itemSource: node.itemSource,
            unit: node.unit,
            rate: node.rate,
            computedQuantity: node.computedQuantity,
            finalCell: node.finalCell,
            sharedSheetId: node.sharedSheetId,
            children: (node.children || []).map(summarize)
          }
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              projectName: project.meta.name,
              sorYear: project.meta.sorYear,
              totalCivilCost: project.dashboardSnapshot?.componentTotals
                ? Object.values(project.dashboardSnapshot.componentTotals).reduce((a, b) => a + (Number(b) || 0), 0)
                : 0,
              tree: summarize(project.root)
            }, null, 2)
          }]
        }
      }

      case 'create_project_data': {
        const { project, path: pPath } = ensureProject(args.projectPath)
        const res = await ops.createProjectData(project, {
          kind: args.kind,
          code: args.code,
          description: args.description,
          unit: args.unit,
          outputQuantity: args.outputQuantity,
          overheadPercent: args.overheadPercent,
          sourceItemCode: args.sourceItemCode,
          sections: args.sections,
          rate: args.rate,
          lead: args.lead
        })
        persistIfPath(pPath)
        const computedRate = res.definition.rate ?? res.breakdown?.ratePerUnit ?? 0
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `Created Project DATA "${res.definition.code}"`,
              dataId: res.definition.id,
              code: res.definition.code,
              unit: res.definition.unit,
              rate: computedRate,
              breakdown: res.breakdown
            }, null, 2)
          }]
        }
      }

      case 'edit_project_data': {
        const { project, path: pPath } = ensureProject(args.projectPath)
        const res = ops.editProjectData(project, {
          dataIdOrCode: args.dataIdOrCode,
          description: args.description,
          unit: args.unit,
          rate: args.rate,
          overheadPercent: args.overheadPercent,
          outputQuantity: args.outputQuantity,
          addLines: args.addLines,
          updateLines: args.updateLines,
          removeLines: args.removeLines,
          replaceSections: args.replaceSections
        })
        persistIfPath(pPath)
        const computedRate = res.definition.rate ?? res.breakdown?.ratePerUnit ?? 0
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              message: `Updated Project DATA "${res.definition.code}"`,
              dataId: res.definition.id,
              code: res.definition.code,
              unit: res.definition.unit,
              rate: computedRate,
              breakdown: res.breakdown
            }, null, 2)
          }]
        }
      }

      case 'list_project_data': {
        const { project } = ensureProject(args?.projectPath)
        const list = ops.listProjectData(project)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              totalCount: list.length,
              items: list
            }, null, 2)
          }]
        }
      }

      case 'get_project_data': {
        const { project } = ensureProject(args?.projectPath)
        const details = ops.getProjectData(project, args.dataIdOrCode)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              dataId: details.definition.id,
              code: details.definition.code,
              definition: details.definition,
              breakdown: details.breakdown
            }, null, 2)
          }]
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (err) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `Error executing ${name}: ${err.message}`
      }]
    }
  }
})

// Start server on stdio
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[E-Estimate MCP Server] Running on stdio')
}

main().catch((err) => {
  console.error('Fatal MCP Server error:', err)
  process.exit(1)
})
