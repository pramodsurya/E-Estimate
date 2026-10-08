# E-Estimate MCP Server & Intelligent Item Resolution

A standards-compliant [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that allows **Agentic AIs** (Claude Desktop, Cursor, Antigravity, Windsurf, LangChain, AutoGPT) to create and edit civil engineering estimates directly, with intelligent Supabase item resolution, formula sanitization, and headless cost sync orchestration.

---

## 🛠️ Exposed MCP Tools

The server implements 18 civil engineering operations directly on top of the native E-Estimate core architecture:

| Tool Name | Purpose | Key Parameters |
| :--- | :--- | :--- |
| `search_ssr_items` | Searches Supabase SSR database by keyword, description, or code prefix with 2026-27 published rates. | `query`, `limit`, `sorYear` |
| `resolve_item` | Intelligently resolves messy codes (e.g. `IRR-CCDW-2-25 & MORTH 21.07`) against Supabase `ssr_item` and `ssr_year`, verifies recipes, handles KG-to-TONNE unit conversions, and safely classifies non-SSR items as `OTHERS`. | `rawCodeOrDescription`, `sorYear`, `originalRate`, `originalUnit` |
| `sync_project_costs` | Orchestrates complete project cost calculation. Connects to Supabase to fetch authoritative DATA recipes, computes rates, rolls up quantities, calculates GST (18%) and seigniorage, and updates `dashboardSnapshot`. | `projectPath` |
| `import_excel_to_project` | Intelligently imports an engineering estimate Excel folder into a fully resolved `.eestimate` file. | `inputDir`, `outputPath`, `projectName`, `sorYear` |
| `create_project` | Creates a new `.eestimate` project with Front Cover & Introduction pages. | `name`, `sorYear`, `location`, `projectPath` |
| `load_project` | Loads an existing `.eestimate` project into the active MCP session. | `projectPath` |
| `create_custom_component` | Creates a custom component or sub-component (Canal, Core Wall Drop, Pipe Culvert, OT, etc.). | `name`, `parentId`, `isSubcomponent`, `manualLengthM` |
| `add_item_to_component` | Adds a billable item (SSR/SOR/DATA) with auto-resolution against Supabase SSR or project DATA. | `componentId`, `name`, `itemCode`, `autoResolve`, `unit`, `rate` |
| `edit_item_excel` | Writes measurements, dimensions ($L \times B \times D$), and Excel formulas to an item sheet, sanitizing `#REF!` and `#VALUE!` errors. | `itemId`, `cells: [{ row, col, v, f }]` |
| `make_multi_item_excel` | Binds multiple items into a single Multi-Item Shared Workbook (Combined Measurement Book). | `itemIds`, `sharedSheetName` |
| `fix_final_number` | Fixes/pins the final total quantity from a cell (e.g. `E18`) so it rolls up to Abstract. | `itemId`, `cellRef` (e.g. "C10") or `row, column` |
| `set_print_area` | Sets the printable page area, paper size (A4/A3), and orientation (portrait/landscape). | `itemId`, `rangeA1` (e.g. "A1:G40"), `pageSize`, `orientation` |
| `create_lead` | Creates a Lead Source / Quarry point and Lead Variant for materials. | `materialName`, `sourceName`, `sourceLat`, `sourceLng`, `leadKm` |
| `get_project_tree` | Inspects the hierarchy of components, items, quantities, and rates. | `projectPath` |
| `create_project_data` | Creates custom Project DATA recipe (Rate Analysis) from scratch or cloned from SSR item. Supports materials, machinery, labour, overhead %, and formula rates. | `code`, `description`, `unit`, `outputQuantity`, `overheadPercent`, `sourceItemCode`, `sections` |
| `edit_project_data` | Edits existing Project DATA definition: adds lines, updates rates/quantities, removes lines, patches overhead %, or replaces sections. Recalculates unit rates immediately. | `dataIdOrCode`, `description`, `overheadPercent`, `addLines`, `updateLines`, `removeLines` |
| `list_project_data` | Lists all Project DATA recipes with unit rates and tree usage counts. | `projectPath` |
| `get_project_data` | Retrieves complete line-by-line rate analysis breakdown of a custom DATA definition. | `dataIdOrCode`, `projectPath` |

---

## 🔍 How Item Code Resolution Works

In legacy engineering estimates, item codes often contain descriptive suffixes, mixed references, or non-SSR items:
- `IRR-CCDW-2-25 & MORTH 21.07 (Page 784)`
- `IRR-CCDW-2-30 & MORTH 21.07 (Page 785)`
- `SOR 2020-21-Public Health Items Table 1` (Hume pipes)

Simply copying these strings verbatim breaks Supabase queries, causing `SSR item not found` and `Recipe unavailable` errors. The MCP resolver resolves this by:
1. **Canonical Code Extraction**: Matches pattern `/IRR-[A-Z]+-\d+(?:-\d+)?/i` to extract pure codes like `IRR-CCDW-2-25`.
2. **Recipe Verification in `ssr_year`**: Queries Supabase to confirm that an active recipe exists for the project's SOR schedule (e.g. `2026-27`).
3. **Safe Classification for Non-SSR Items**: Identifies Public Health and non-standard items and classifies them as `itemSource: 'OTHERS'` with `categoryKey: 'custom'`, preserving the engineer's unit rate and preventing failing SSR lookups.
4. **Unit Conversion**: Automatically detects when input quantities are in `KG` for SSR items priced in `TONNE`, applying the 0.001 metric conversion factor.
5. **Formula Sanitization**: Replaces `#REF!` and `#VALUE!` errors in old spreadsheets with clean static numbers or valid formulas.

---

## 🏗️ Project DATA & Custom Rate Analysis Operations

In complex irrigation projects (such as MKLIS Lift Irrigation Scheme, canal lining, special barrel transitions, retaining walls), engineers frequently define non-standard rate recipes called **Project DATA**. The MCP server provides 4 specialized tools designed specifically for AI Agents to create, clone, customize, and edit these Rate Analyses with zero loss of engineering precision:

### 1. Creating Custom DATA from Scratch (`create_project_data`)
Create a completely custom multi-section Rate Analysis recipe with materials, machinery, labour, contractor overheads, and dynamic formula expressions:
```json
{
  "code": "DATA-M20-CUSTOM",
  "description": "Design Mix Vibrated M20 Concrete with 20mm aggregate for Pump House",
  "unit": "CUM",
  "outputQuantity": 10,
  "overheadPercent": 14,
  "sections": [
    {
      "key": "materials",
      "title": "Materials",
      "items": [
        { "description": "Cement (OPC 43)", "unit": "TONNE", "quantity": 3.5, "rate": 6800 },
        { "description": "Sand for Concrete", "unit": "CUM", "quantity": 4.5, "rate": 1100, "seigniorageApplicable": true },
        { "description": "Coarse Aggregate 20mm", "unit": "CUM", "quantity": 9.0, "rate": 760, "seigniorageApplicable": true }
      ]
    },
    {
      "key": "machinery",
      "title": "Machinery",
      "items": [
        { "description": "Concrete Mixer 10/7 cft", "unit": "DAY", "quantity": 1, "rate": 2500 },
        { "description": "Pin Vibrator with Needle", "unit": "DAY", "quantity": 1, "rate": 800 }
      ]
    },
    {
      "key": "labour",
      "title": "Labour Charges",
      "items": [
        { "description": "Mason 1st Class", "unit": "DAY", "quantity": 2, "rate": 900 },
        { "description": "Mazdoor", "unit": "DAY", "quantity": 10, "rate": 620 }
      ]
    }
  ]
}
```

### 2. Cloning an Authoritative SSR Item (`sourceItemCode`)
Fetch the published SSR recipe directly from Supabase (`ssr_item` + `ssr_year`), copy all official lines and quantities, and allow instant overriding of contractor overhead %, output quantity, or custom adjustments:
```json
{
  "code": "DATA-M20-MODIFIED",
  "sourceItemCode": "IRR-CCDW-2-29",
  "description": "Modified M20 Concrete with 10% Contractor Overhead",
  "overheadPercent": 10
}
```

### 3. Granular Editing & Line Operations (`edit_project_data`)
Supports targeted updates without re-sending the whole recipe:
- **Add Lines**: Appends new materials, equipment, or specialized labour.
- **Update Lines**: Patches lines by `lineIndex` or `descriptionQuery` (e.g. updating a cement rate or batch quantity).
- **Remove Lines**: Safely deletes lines by index or keyword.
- **Overhead % Adjustments**: Recalculates unit rates with new contractor margin immediately.

```json
{
  "dataIdOrCode": "DATA-M20-CUSTOM",
  "overheadPercent": 12,
  "addLines": [
    {
      "sectionKey": "materials",
      "description": "Waterproofing Compound Integral Admixture",
      "quantity": 12,
      "unit": "KG",
      "rate": 64
    }
  ]
}
```

### 4. Automatic Project Cost Rollup & Sync
When items in the project tree reference a custom DATA code:
1. `add_item_to_component` automatically links `categoryKey: 'project_data'`, binds `projectDataId`, and sets `itemSource: 'SSR'`.
2. `sync_project_costs` evaluates the DATA recipe, calculates the exact unit rate per CUM/SQM, multiplies by the item's measurement book quantity, and adds contractor GST (18%) and seigniorage into the project abstract!

---

## 🚀 How to Run

### In npm:
```bash
# Start MCP server over stdio
npm run mcp

# Run the automated verification test suite
npm run test:mcp
```

### In Claude Desktop (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "e-estimate": {
      "command": "node",
      "args": [
        "c:/Users/napra/OneDrive/Desktop/Software E-estimate/scripts/mcp/mcp-server.cjs"
      ]
    }
  }
}
```

### In Cursor / Windsurf / Antigravity MCP settings:
```json
{
  "name": "e-estimate",
  "command": "node",
  "args": ["scripts/mcp/mcp-server.cjs"]
}
```
