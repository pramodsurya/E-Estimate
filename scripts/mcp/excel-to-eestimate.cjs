/**
 * Intelligent Excel to E-Estimate (.eestimate) Converter.
 * 
 * - Parses engineering estimate workbooks (.xls, .xlsx).
 * - Resolves all items against Supabase ssr_item and ssr_year.
 * - Extracts canonical SSR codes (e.g. IRR-CCDW-2-25).
 * - Classifies non-SSR items (Hume pipes, Public Health SOR) as OTHERS to prevent recipe crashes.
 * - Sanitizes cell formulas to eliminate #REF! and #VALUE! errors.
 * - Sets finalCell coordinates and print areas.
 * - Links multi-item shared measurement books.
 * - Orchestrates complete cost sync via Supabase DATA recipe engine.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const ops = require('./estimate-core-ops.cjs');

/**
 * Convert an XLSX sheet range to Univer cellData dictionary, sanitizing errors
 */
function extractUniverCellData(sheet, maxRows = 60, maxCols = 25) {
  const ref = sheet['!ref'];
  if (!ref) return { cellData: {}, rowCount: 50, columnCount: 15 };

  const range = XLSX.utils.decode_range(ref);
  const endR = Math.min(range.e.r, maxRows - 1);
  const endC = Math.min(range.e.c, maxCols - 1);

  const cellData = {};
  for (let r = 0; r <= endR; r++) {
    const rKey = String(r);
    for (let c = 0; c <= endC; c++) {
      const cKey = String(c);
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (!cell) continue;

      let val = cell.v;
      let formula = cell.f;

      // Sanitize #REF! or #VALUE!
      if (typeof val === 'string' && (val.includes('#REF!') || val.includes('#VALUE!'))) {
        val = null;
      }
      if (typeof formula === 'string') {
        if (formula.includes('#REF!') || formula.includes('#VALUE!')) {
          formula = undefined;
        } else if (!formula.startsWith('=')) {
          formula = '=' + formula;
        }
      }

      if (val !== undefined && val !== null || formula) {
        if (!cellData[rKey]) cellData[rKey] = {};
        const cellObj = {};
        if (val !== undefined && val !== null) cellObj.v = val;
        if (formula) cellObj.f = formula;
        cellData[rKey][cKey] = cellObj;
      }
    }
  }

  return {
    cellData,
    rowCount: Math.max(endR + 10, 50),
    columnCount: Math.max(endC + 5, 15)
  };
}

/**
 * Process LM1 Directory and produce fully resolved, synced .eestimate file
 */
async function convertLm1ToEestimate({
  inputDir,
  outputPath,
  projectName = 'MNKLIS - Kodangal Tank LM1 Minor Estimates',
  sorYear = '2026-27'
}) {
  console.log('===============================================================');
  console.log(`Starting Intelligent Conversion for "${projectName}"`);
  console.log(`Source Folder: ${inputDir}`);
  console.log(`SOR Schedule: ${sorYear}`);
  console.log('===============================================================\n');

  // 1. Create Base Project
  const project = ops.createProject({
    name: projectName,
    sorYear,
    location: {
      label: 'Kodangal, Telangana',
      lat: 17.1086,
      lng: 77.6271
    }
  });

  const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.xls') || f.endsWith('.xlsx'));
  console.log(`Found ${files.length} Excel workbooks in folder.\n`);

  // Map of component name -> array of added item nodes
  const componentMap = new Map();

  for (const fileName of files) {
    const filePath = path.join(inputDir, fileName);
    const wb = XLSX.readFile(filePath);
    console.log(`\n>>> Processing Workbook: ${fileName}`);

    if (fileName.toLowerCase().includes('core wall drop')) {
      await processCoreWallDrop(project, wb, sorYear, componentMap);
    } else if (fileName.toLowerCase().includes('ot')) {
      await processOfftakes(project, wb, sorYear, componentMap);
    } else if (fileName.toLowerCase().includes('pipe culvert')) {
      await processPipeCulverts(project, wb, sorYear, componentMap);
    } else if (fileName.toLowerCase().includes('vertical drop')) {
      await processVerticalDrops(project, wb, sorYear, componentMap);
    }
  }

  // 2. Headless Cost Sync Orchestration
  console.log('\n===============================================================');
  console.log('Orchestrating Project DATA Recipes, Rates, and Cost Sync...');
  console.log('===============================================================');

  const syncResult = await ops.syncProjectCosts(project, { projectPath: outputPath });

  console.log(`\nSuccessfully Synced ${syncResult.syncedItemCount} Items!`);
  console.log('Component Cost Breakdown:');
  for (const [compId, total] of Object.entries(syncResult.componentTotals || {})) {
    const compNode = project.root.children.find(c => c.id === compId);
    console.log(`  - ${compNode?.name || compId}: ₹ ${(Number(total) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
  }
  console.log(`Total Civil Works Cost: ₹ ${(syncResult.totalCivilCost || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
  console.log(`GST (18%): ₹ ${(syncResult.gstAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
  console.log(`Estimated Project Cost including GST: ₹ ${(syncResult.totalWithGst || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
  console.log(`\nOutput saved to: ${outputPath}`);

  return { project, syncResult };
}

/**
 * 1. Process Core Wall Drop Workbook
 */
async function processCoreWallDrop(project, wb, sorYear, componentMap) {
  const comp = ops.createCustomComponent(project, { name: 'Core Wall Drops' });
  const sheet = wb.Sheets['Core Wall Drop'] || wb.Sheets[wb.SheetNames[0]];
  const { cellData, rowCount, columnCount } = extractUniverCellData(sheet, 25, 12);

  const itemsConfig = [
    { name: 'Earth work excavation', rawCode: 'IRR-CCDW-1-2', qty: 132.403, col: 4, finalRow: 16 },
    { name: 'Vibrated M-15 grade cement concrete', rawCode: 'IRR-CCDW-2-9', qty: 63.576, col: 5, finalRow: 16 },
    { name: 'Vibrated M-20 grade cement concrete', rawCode: 'IRR-CCDW-2-29', qty: 1.213, col: 6, finalRow: 16 },
    { name: 'Filling murrum / gravely soil', rawCode: 'IRR-CCDW-7-3', qty: 68.827, col: 7, finalRow: 16 }
  ];

  const addedIds = [];
  for (const itemDef of itemsConfig) {
    const res = await ops.resolveItem({ rawCodeOrDescription: itemDef.rawCode, sorYear });
    console.log(`  [Resolve] ${itemDef.rawCode} -> Code: ${res.resolvedCode} (${res.itemSource}) | Has Recipe: ${res.hasRecipe}`);

    const itemNode = ops.addItem(project, {
      componentId: comp.id,
      name: itemDef.name,
      itemCode: res.resolvedCode,
      itemSource: res.itemSource,
      categoryKey: res.categoryKey,
      itemDescription: res.itemDescription,
      unit: res.unit,
      rate: res.rate,
      computedQuantity: itemDef.qty
    });

    // Populate measurement sheet
    itemNode.spreadsheet = {
      sheetOrder: ['sheet1'],
      sheets: {
        sheet1: {
          id: 'sheet1',
          name: 'Core Wall Drop Measurements',
          cellData: JSON.parse(JSON.stringify(cellData)),
          rowCount,
          columnCount
        }
      }
    };

    ops.fixFinalNumber(project, { itemId: itemNode.id, row: itemDef.finalRow, column: itemDef.col });
    ops.setPrintArea(project, { itemId: itemNode.id, rangeA1: 'A1:I21', pageSize: 'A4', orientation: 'landscape' });
    addedIds.push(itemNode.id);
  }

  // Link as shared measurement book
  ops.makeMultiItemExcel(project, { itemIds: addedIds, sharedSheetName: 'Core Wall Drop Measurements' });
  componentMap.set(comp.id, addedIds);
}

/**
 * 2. Process Offtakes (OT) Workbook
 */
async function processOfftakes(project, wb, sorYear, componentMap) {
  const comp = ops.createCustomComponent(project, { name: 'Offtakes (OT & Barrel OT)' });
  const sheet = wb.Sheets['Barrel_OT'] || wb.Sheets['Abstract'] || wb.Sheets[wb.SheetNames[0]];
  const { cellData, rowCount, columnCount } = extractUniverCellData(sheet, 25, 22);

  const itemsConfig = [
    { name: 'Earth work excavation', rawCode: 'IRR-CCDW-1-2', qty: 262.85, unit: 'CUM' },
    { name: 'M 15 Grade concrete for Foundation', rawCode: 'IRR-CCDW-2-3', qty: 14.60, unit: 'CUM' },
    { name: 'M 15 grade concrete for wing walls', rawCode: 'IRR-CCDW-2-9', qty: 73.21, unit: 'CUM' },
    { name: 'M 20 Grade concrete for wearing coat', rawCode: 'IRR-CCDW-2-29', qty: 0.51, unit: 'CUM' },
    { name: 'M 25 Grade concrete for Barrel', rawCode: 'IRR-CCDW-2-25 & MORTH 21.07 (Page 784)', qty: 3.53, unit: 'CUM' },
    { name: 'Gate Fabrication & Supply (Item 1)', rawCode: 'IRR-GAW-2-8\n', qty: 862.40, unit: 'KG' },
    { name: 'Gate Erection & Commissioning (Item 2)', rawCode: 'IRR-GAW-2-1\n', qty: 924.00, unit: 'KG' },
    { name: 'Gate Testing & Commissioning (Item 3)', rawCode: 'IRR-GAW-2-6  ', qty: 1370.60, unit: 'KG' },
    { name: 'Manufacture & Supply 300 mm dia Pipes', rawCode: 'SOR 2020-21-Public Health Items Table 1', qty: 70.00, unit: 'Rmt', rate: 1756.27 }
  ];

  const addedIds = [];
  for (const itemDef of itemsConfig) {
    const res = await ops.resolveItem({
      rawCodeOrDescription: itemDef.name ? `${itemDef.rawCode} ${itemDef.name}` : itemDef.rawCode,
      sorYear,
      originalRate: itemDef.rate,
      originalUnit: itemDef.unit
    });
    console.log(`  [Resolve] ${itemDef.rawCode} -> Code: ${res.resolvedCode} (${res.itemSource}) | Has Recipe: ${res.hasRecipe}`);

    const finalQty = res.unitConversion ? itemDef.qty * res.unitConversion.factor : itemDef.qty;
    let projectDataId = undefined;
    if (res.itemSource === 'OTHERS' && itemDef.rate) {
      const code = itemDef.name.includes('300') ? 'DATA-PH-300MM-PIPE' : 'DATA-PH-500MM-PIPE';
      let existing = project.projectData?.find(d => d.code === code);
      if (!existing) {
        const d = await ops.createProjectData(project, {
          kind: 'sor',
          code,
          description: `${itemDef.name} (${itemDef.rawCode})`,
          unit: res.unit || itemDef.unit || 'Rmt',
          rate: itemDef.rate
        });
        existing = d.definition;
      }
      projectDataId = existing.id;
    }

    const itemNode = ops.addItem(project, {
      componentId: comp.id,
      name: itemDef.name,
      itemCode: res.resolvedCode,
      projectDataId,
      itemSource: res.itemSource,
      categoryKey: res.categoryKey,
      itemDescription: res.itemDescription,
      unit: res.unit,
      rate: res.rate,
      computedQuantity: finalQty,
      sorCatalogue: res.sorCatalogue
    });

    itemNode.spreadsheet = {
      sheetOrder: ['sheet1'],
      sheets: {
        sheet1: {
          id: 'sheet1',
          name: 'Offtake Measurements',
          cellData: JSON.parse(JSON.stringify(cellData)),
          rowCount,
          columnCount
        }
      }
    };

    ops.setPrintArea(project, { itemId: itemNode.id, rangeA1: 'A1:V16', pageSize: 'A3', orientation: 'landscape' });
    addedIds.push(itemNode.id);
  }

  ops.makeMultiItemExcel(project, { itemIds: addedIds, sharedSheetName: 'Offtake Measurements' });
  componentMap.set(comp.id, addedIds);
}

/**
 * 3. Process Pipe Culverts Workbook
 */
async function processPipeCulverts(project, wb, sorYear, componentMap) {
  const comp = ops.createCustomComponent(project, { name: 'Pipe Culverts' });
  const sheet = wb.Sheets['Pipe Culvert'] || wb.Sheets[wb.SheetNames[0]];
  const { cellData, rowCount, columnCount } = extractUniverCellData(sheet, 25, 18);

  const itemsConfig = [
    { name: 'Earth work excavation', rawCode: 'IRR-CCDW-1-2', qty: 165.418, unit: 'CUM', col: 7, finalRow: 10 },
    { name: 'M-15 grade cement concrete For Bed', rawCode: 'IRR-CCDW-2-3', qty: 24.671, unit: 'CUM', col: 8, finalRow: 10 },
    { name: 'M-15 grade cement concrete for Head wall', rawCode: 'IRR-CCDW-2-9', qty: 139.933, unit: 'CUM', col: 9, finalRow: 10 },
    { name: 'M-20 grade cement concrete for Wearing coat', rawCode: 'IRR-CCDW-2-29', qty: 2.821, unit: 'CUM', col: 10, finalRow: 10 },
    { name: 'NP-3 class 500mm RCC Pipes', rawCode: 'SOR 2020-21-Public Health Items Table 1', qty: 30.00, unit: 'Rmt', rate: 3237.65, col: 12, finalRow: 10 },
    { name: 'Laying and jointing 500mm dia NP2 pipes', rawCode: 'IRR-CCDW-6-2', qty: 6.00, unit: 'Nos', rate: 689.60 },
    { name: 'Filling murrum / gravely soil', rawCode: 'IRR-CCDW-7-3', qty: 140.989, unit: 'CUM' }
  ];

  const addedIds = [];
  for (const itemDef of itemsConfig) {
    const res = await ops.resolveItem({
      rawCodeOrDescription: itemDef.name ? `${itemDef.rawCode} ${itemDef.name}` : itemDef.rawCode,
      sorYear,
      originalRate: itemDef.rate,
      originalUnit: itemDef.unit
    });
    let projectDataId = undefined;
    if (res.itemSource === 'OTHERS' && itemDef.rate) {
      const code = itemDef.name.includes('300') ? 'DATA-PH-300MM-PIPE' : 'DATA-PH-500MM-PIPE';
      let existing = project.projectData?.find(d => d.code === code);
      if (!existing) {
        const d = await ops.createProjectData(project, {
          kind: 'sor',
          code,
          description: `${itemDef.name} (${itemDef.rawCode})`,
          unit: res.unit || itemDef.unit || 'Rmt',
          rate: itemDef.rate
        });
        existing = d.definition;
      }
      projectDataId = existing.id;
    }

    const itemNode = ops.addItem(project, {
      componentId: comp.id,
      name: itemDef.name,
      itemCode: res.resolvedCode,
      projectDataId,
      itemSource: res.itemSource,
      categoryKey: res.categoryKey,
      itemDescription: res.itemDescription,
      unit: res.unit,
      rate: res.rate,
      computedQuantity: itemDef.qty,
      sorCatalogue: res.sorCatalogue
    });

    itemNode.spreadsheet = {
      sheetOrder: ['sheet1'],
      sheets: {
        sheet1: {
          id: 'sheet1',
          name: 'Pipe Culvert Measurements',
          cellData: JSON.parse(JSON.stringify(cellData)),
          rowCount,
          columnCount
        }
      }
    };

    if (itemDef.finalRow && itemDef.col) {
      ops.fixFinalNumber(project, { itemId: itemNode.id, row: itemDef.finalRow, column: itemDef.col });
    }
    ops.setPrintArea(project, { itemId: itemNode.id, rangeA1: 'A1:P15', pageSize: 'A3', orientation: 'landscape' });
    addedIds.push(itemNode.id);
  }

  ops.makeMultiItemExcel(project, { itemIds: addedIds, sharedSheetName: 'Pipe Culvert Measurements' });
  componentMap.set(comp.id, addedIds);
}

/**
 * 4. Process Vertical Drops Workbook
 */
async function processVerticalDrops(project, wb, sorYear, componentMap) {
  const comp = ops.createCustomComponent(project, { name: 'Vertical Drops' });
  const sheet = wb.Sheets['Vertical Drop'] || wb.Sheets[wb.SheetNames[0]];
  const { cellData, rowCount, columnCount } = extractUniverCellData(sheet, 25, 16);

  const itemsConfig = [
    { name: 'Earth work excavation in all soils', rawCode: 'IRR-CCDW-1-2', qty: 229.00, col: 5, finalRow: 13 },
    { name: 'M 15 grade concrete for wing walls', rawCode: 'IRR-CCDW-2-9', qty: 97.00, col: 6, finalRow: 13 },
    { name: 'M20 Grade concrete for Coping on Drop', rawCode: 'IRR-CCDW-2-29', qty: 0.341, col: 7, finalRow: 13 },
    { name: 'M 20 Grade concrete for wearing coat', rawCode: 'IRR-CCDW-2-29', qty: 1.339, col: 8, finalRow: 13 },
    { name: 'Filling murrum / gravely soil', rawCode: 'IRR-CCDW-7-3', qty: 187.50, col: 9, finalRow: 13 },
    { name: '75 mm dia GI weep hole pipes', rawCode: 'IRR-CAW-7-19', qty: 5.00, col: 10, finalRow: 13 },
    { name: '100 mm dia perforated PVC weep hole pipes', rawCode: 'IRR-CAW-7-24', qty: 150.00, col: 11, finalRow: 13 }
  ];

  const addedIds = [];
  for (const itemDef of itemsConfig) {
    const res = await ops.resolveItem({ rawCodeOrDescription: itemDef.rawCode, sorYear });
    console.log(`  [Resolve] ${itemDef.rawCode} -> Code: ${res.resolvedCode} (${res.itemSource}) | Has Recipe: ${res.hasRecipe}`);

    const itemNode = ops.addItem(project, {
      componentId: comp.id,
      name: itemDef.name,
      itemCode: res.resolvedCode,
      itemSource: res.itemSource,
      categoryKey: res.categoryKey,
      itemDescription: res.itemDescription,
      unit: res.unit,
      rate: res.rate,
      computedQuantity: itemDef.qty
    });

    itemNode.spreadsheet = {
      sheetOrder: ['sheet1'],
      sheets: {
        sheet1: {
          id: 'sheet1',
          name: 'Vertical Drop Measurements',
          cellData: JSON.parse(JSON.stringify(cellData)),
          rowCount,
          columnCount
        }
      }
    };

    ops.fixFinalNumber(project, { itemId: itemNode.id, row: itemDef.finalRow, column: itemDef.col });
    ops.setPrintArea(project, { itemId: itemNode.id, rangeA1: 'A1:O18', pageSize: 'A3', orientation: 'landscape' });
    addedIds.push(itemNode.id);
  }

  ops.makeMultiItemExcel(project, { itemIds: addedIds, sharedSheetName: 'Vertical Drop Measurements' });
  componentMap.set(comp.id, addedIds);
}

module.exports = {
  convertLm1ToEestimate,
  extractUniverCellData
};
