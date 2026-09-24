const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');
const os = require('node:os');
const { execSync } = require('child_process');
const readExcelRust = require('./read-excel-rust.cjs');

const root = 'C:/Users/napra/OneDrive/Desktop/Software E-estimate';

function loadTs(filePath, mocks = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filePath
  });
  const loaded = new Module(filePath, module);
  loaded.filename = filePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath));
  loaded.require = (request) => request in mocks ? mocks[request] : Module.createRequire(filePath)(request);
  loaded._compile(outputText, filePath);
  return loaded.exports;
}

const documentSettings = loadTs(path.join(root, 'src/renderer/src/lib/typist-output/documentSettings.ts'));
const rateAnalysisMock = {
  calculateBaseRateAnalysis: (recipe) => {
    const mat = 1609.60;
    const lab = 5650.00;
    const baseCost = mat + lab;
    const ovh = (baseCost * 13.615) / 100;
    const allowPct = recipe?.areaAllowancePercent || 0;
    const allowAmt = (lab * allowPct) / 100;
    const totalCost = baseCost + ovh + allowAmt;
    return {
      sectionTotals: { materials: mat, machinery: 0, labour: lab },
      labourBaseCost: lab,
      baseCost,
      overheadAmount: ovh,
      areaAllowanceAmount: allowAmt,
      totalCost,
      labourUnitBase: 565.00,
      labourUnitProfit: 76.92,
      labourUnitTotal: 641.92,
      ratePerUnit: totalCost / 10
    };
  },
  calculateRateAnalysis: (recipe) => {
    const mat = 1609.60;
    const lab = 5650.00;
    const baseCost = mat + lab;
    const ovh = (baseCost * 13.615) / 100;
    const allowPct = recipe?.areaAllowancePercent || 0;
    const allowAmt = (lab * allowPct) / 100;
    const totalCost = baseCost + ovh + allowAmt;
    return {
      sectionTotals: { materials: mat, machinery: 0, labour: lab },
      baseCost,
      overheadAmount: ovh,
      areaAllowanceAmount: allowAmt,
      totalCost,
      ratePerUnit: totalCost / 10
    };
  },
  calculateOptionalAddition: () => null,
  labourRowsForDisplay: () => [
    { label: 'labour component/unit qty', value: '565.00', amount: '565.00', percent: '', unit: '' },
    { label: "Add contractor's profit and overhead charges", value: '76.92', percent: '13.615%', amount: '76.92', unit: '' },
    { label: "labour component/unit qty (including contractor's profit)", value: '641.92', percent: '', amount: '641.92', unit: '' }
  ]
};

const visibilityMock = {
  defaultRateAnalysisLayout: () => ({
    codeVisible: true, descriptionVisible: true, unitQuantityVisible: true,
    sections: { materials: { visible: true }, machinery: { visible: true }, labour: { visible: true } },
    labourSummary: { visible: true }, abstract: { visible: true }, descriptionRuns: []
  }),
  descriptionRunsForDisplay: (text, runs) => runs && runs.length ? runs : [{ text, bold: false, italic: false, underline: false }]
};

const dataPresentation = loadTs(path.join(root, 'src/renderer/src/lib/dataPresentation.ts'), {
  './rateAnalysis': rateAnalysisMock,
  './leadApplicability': { parseLeadInfo: () => ({}), addonLeadRuleForVariant: () => null },
  './rateAnalysisVisibility': visibilityMock
});

const dataTypst = loadTs(path.join(root, 'src/renderer/src/lib/typist-output/dataTypst.ts'), {
  '../rateAnalysisVisibility': visibilityMock,
  '../dataPresentation': dataPresentation,
  './documentSettings': documentSettings,
  '../signatureFooter': {
    DATA_SIGNATURE_SCOPE: 'data',
    printableSignatureRows: () => [],
    resolveSignatureFooter: () => ({ enabled: false, placement: 'subject_end', rows: [] })
  },
  './data.typ?raw': ''
});

const dataExcel = loadTs(path.join(root, 'src/renderer/src/lib/excel-output/dataExcel.ts'), {
  '../typist-output/dataTypst': dataTypst,
  '../dataSheets': { calculateDataSheets: async (sheets) => sheets },
  './excelDocumentSettings': {
    resolveExcelDocumentSettings: (project) => documentSettings.resolveProjectDocumentSettings(project.projectPrintSettings),
    excelPrintSettings: (settings) => ({
      pageSize: settings.pageSize,
      orientation: settings.orientation,
      marginsMm: settings.margins,
      fontName: 'Times New Roman',
      fontSizePt: settings.fontSizePt
    })
  },
  './excelSignature': { excelSignatureSettings: () => ({ placement: 'subject_end', rows: [] }) }
});

async function runTest() {
  console.log('Testing buildDataExcelWorkbook...');

  const mockProject = {
    meta: { name: 'Test Irrigation Project', sorYear: '2026-27', sorZone: 'ZONE-3' },
    projectPrintSettings: {}
  };

  const sampleSheets = [
    {
      id: 'sheet-1',
      itemKey: 'SSR-1',
      scopeName: 'Canal / Reach 1',
      usagePath: 'Canal / Reach 1',
      recipe: {
        itemSource: 'SSR',
        itemCode: 'IRR-PMW-2-11',
        description: 'Providing and fixing 20 x 20 x 75 cm size temporary bench mark stone in CC 1 : 4 : 8',
        sectionHeading: 'PRELIMINARY MAINTENANCE WORKS',
        unit: 'Nos.',
        outputQuantity: 10,
        sections: [
          {
            key: 'materials',
            lines: [
              { slNo: '1', description: 'Rough stone 20x20x75 cm', unit: 'Each', quantity: 10, rate: 49.00, amount: 490.00 },
              { slNo: '2', description: 'Cement for CC & top finishing', unit: 'kg', quantity: 91, rate: 5.10, amount: 464.10 },
              { slNo: '3', description: 'Coarse aggregate 40-20 mm', unit: 'cum', quantity: 0.25, rate: 1107.00, amount: 276.75 },
              { slNo: '4', description: 'Sand (Un-Screened )', unit: 'cum', quantity: 0.25, rate: 777.00, amount: 194.25 }
            ]
          },
          {
            key: 'machinery',
            lines: []
          },
          {
            key: 'labour',
            lines: [
              { slNo: '1', description: 'work inspector', unit: 'Day', quantity: 1, rate: 845.00, amount: 845.00 },
              { slNo: '2', description: 'Stone chiseller Cl- I', unit: 'Day', quantity: 3, rate: 755.00, amount: 2265.00 },
              { slNo: '3', description: 'mazdoor', unit: 'Day', quantity: 4, rate: 635.00, amount: 2540.00 }
            ]
          }
        ],
        overheadPercent: 13.615,
        areaAllowancePercent: 25,
        areaAllowanceLabel: 'ITDA Agency Area Allowance (+25%)'
      },
      leadApplications: [
        {
          id: 'lead-app-1',
          variantId: 'var-1',
          quantity: 0.25,
          unit: 'cum',
          grossRate: 245.00,
          grossAmount: 61.25,
          calculation: {
            deductedLeadRate: 40.00,
            fullLeadRate: 285.00,
            netLeadRate: 245.00,
            unit: 'cum',
            rows: []
          }
        }
      ],
      leadVariants: [
        {
          id: 'var-1',
          materialName: 'Sand from approved quarry',
          leadKm: 15,
          liftM: 0,
          avgLead: {
            mode: 'line',
            componentName: 'Canal Reach 1 Alignment',
            pointCount: 12,
            avgKm: 15.00
          }
        }
      ],
      sorPrintRate: null
    },
    {
      id: 'sheet-1b',
      itemKey: 'SSR-1',
      scopeName: 'Canal / Reach 2',
      usagePath: 'Canal / Reach 2',
      recipe: {
        itemSource: 'SSR',
        itemCode: 'IRR-PMW-2-11',
        description: 'Providing and fixing 20 x 20 x 75 cm size temporary bench mark stone in CC 1 : 4 : 8',
        sectionHeading: 'PRELIMINARY MAINTENANCE WORKS',
        unit: 'Nos.',
        outputQuantity: 10,
        sections: [
          {
            key: 'materials',
            lines: [
              { slNo: '1', description: 'Rough stone 20x20x75 cm', unit: 'Each', quantity: 10, rate: 49.00, amount: 490.00 },
              { slNo: '2', description: 'Cement for CC & top finishing', unit: 'kg', quantity: 91, rate: 5.10, amount: 464.10 },
              { slNo: '3', description: 'Coarse aggregate 40-20 mm', unit: 'cum', quantity: 0.25, rate: 1107.00, amount: 276.75 },
              { slNo: '4', description: 'Sand (Un-Screened )', unit: 'cum', quantity: 0.25, rate: 777.00, amount: 194.25 }
            ]
          },
          {
            key: 'machinery',
            lines: []
          },
          {
            key: 'labour',
            lines: [
              { slNo: '1', description: 'work inspector', unit: 'Day', quantity: 1, rate: 845.00, amount: 845.00 },
              { slNo: '2', description: 'Stone chiseller Cl- I', unit: 'Day', quantity: 3, rate: 755.00, amount: 2265.00 },
              { slNo: '3', description: 'mazdoor', unit: 'Day', quantity: 4, rate: 635.00, amount: 2540.00 }
            ]
          }
        ],
        overheadPercent: 13.615,
        areaAllowancePercent: 25,
        areaAllowanceLabel: 'ITDA Agency Area Allowance (+25%)'
      },
      leadApplications: [
        {
          id: 'lead-app-2',
          variantId: 'var-2',
          quantity: 0.25,
          unit: 'cum',
          grossRate: 380.00,
          grossAmount: 95.00,
          calculation: {
            deductedLeadRate: 40.00,
            fullLeadRate: 420.00,
            netLeadRate: 380.00,
            unit: 'cum',
            rows: []
          }
        }
      ],
      leadVariants: [
        {
          id: 'var-2',
          materialName: 'Sand from approved quarry',
          leadKm: 28.5,
          liftM: 0,
          weightedLead: {
            entries: [
              { variantId: 'sub-1', variantName: 'Quarry A', leadKm: 20.0, quantity: 100, unit: 'cum' },
              { variantId: 'sub-2', variantName: 'Quarry B', leadKm: 37.0, quantity: 100, unit: 'cum' }
            ],
            totalQuantity: 200,
            weightedAvgKm: 28.5,
            createdAt: '2026-09-18'
          }
        }
      ],
      sorPrintRate: null
    },
    {
      id: 'sheet-2',
      itemKey: 'SOR-1',
      recipe: {
        itemSource: 'SOR',
        description: 'Ordinary Portland Cement (43/53 Grade)',
        unit: 'tonne',
        sections: [{ key: 'materials', lines: [{ rate: 5600.00 }] }]
      },
      leadApplications: [],
      leadVariants: [],
      sorPrintRate: {
        hasNumericRate: true,
        baseRate: 5600.00,
        leadRate: 0,
        finalRate: 5600.00,
        hasLead: false,
        rateText: '5,600.00'
      }
    }
  ];

  // 1. Verify that JS fallback is completely removed: without native compiler, it must reject!
  await assert.rejects(
    async () => {
      await dataExcel.buildDataExcelWorkbook(mockProject, sampleSheets);
    },
    /Native Excel compiler \(rust_xlsxwriter\) is required/,
    'Must strictly require native Rust compiler without any JS fallback'
  );
  console.log('Verified: No JavaScript fallback exists. Native rust_xlsxwriter is strictly required.');

  // 2. Wire up native Rust compiler via e-estimate.exe --compile-excel
  const payload = dataExcel.buildDataExcelPayload(mockProject, sampleSheets);

  // 3. Payload content: everything the old ExcelJS read-back asserted must be
  // present in the payload the native compiler receives (no xlsx reader remains).
  assert.equal(payload.projectName, 'Test Irrigation Project', 'Payload carries project name');
  assert.deepEqual(payload.dataSignature, { placement: 'subject_end', rows: [] }, 'DATA signature setting is included in the native payload');
  assert.equal(payload.sorYear, '2026-27', 'Payload carries SOR year');
  assert.equal(payload.sorZone, 'ZONE-3', 'Payload carries SOR zone');
  assert.equal(payload.recipes.length, 2, 'Two SSR recipe payloads (Reach 1 + Reach 2)');
  assert.equal(payload.sor.length, 1, 'One SOR payload row');
  assert.equal(payload.sor[0].sl, 1, 'SOR row serial starts at 1');
  assert.equal(payload.sor[0].description, 'Ordinary Portland Cement (43/53 Grade)', 'SOR description passes through');
  assert.equal(payload.sor[0].unit, 'tonne', 'SOR unit passes through');
  assert.equal(payload.sor[0].rate, 5600, 'SOR numeric rate passes through');
  const payloadText = JSON.stringify(payload);
  assert.ok(payloadText.includes('Canal / Reach 1'), 'Reach 1 scope reaches the payload');
  assert.ok(payloadText.includes('Canal / Reach 2'), 'Reach 2 scope reaches the payload');
  assert.ok(payloadText.includes('ITDA Agency Area Allowance'), 'Area allowance label reaches the payload');
  assert.ok(payloadText.includes('Average of 12 points'), 'Avg lead formula reaches the payload');
  assert.ok(payloadText.includes('28.50 km'), 'Weighted avg lead formula reaches the payload');
  console.log('Payload verified: 2 SSR recipes + 1 SOR row, scopes, allowance, avg + weighted lead details.');

  // 4. Static contract: the Rust data path must accept exactly this shape.
  const rustCompiler = readExcelRust(root);
  assert.ok(rustCompiler.includes('pub recipes: Vec<ExcelRecipe>'), 'Rust data path reads recipes');
  assert.ok(rustCompiler.includes('pub sor: Vec<ExcelSorItem>'), 'Rust data path reads sor rows');
  console.log('Rust contract verified: recipes + sor payload fields present.');

  // 3b. Cache contract: invalidation hash + fast-path wiring (no network, no binaries).
  const compileCache = loadTs(path.join(root, 'src/renderer/src/lib/typist-output/compileCache.ts'));
  assert.equal(compileCache.COMPILER_VERSION, 'typst:0.15.1', 'Compiler version pins the engine');
  const base = {
    mainContent: '#hello',
    inputs: { b: '2', a: '1' },
    shadowFiles: { 'x.json': '{"n":1}' },
    figureRefs: [{ objectPath: 'fig/a.png' }]
  };
  const h1 = compileCache.contentHash(base);
  assert.equal(compileCache.contentHash({ ...base, inputs: { a: '1', b: '2' } }), h1, 'Key order must not change the hash');
  assert.notEqual(compileCache.contentHash({ ...base, mainContent: '#other' }), h1, 'Source edits change the hash');
  assert.notEqual(compileCache.contentHash({ ...base, inputs: { a: '1', b: '3' } }), h1, 'Input edits change the hash');
  assert.notEqual(compileCache.contentHash({ ...base, shadowFiles: { 'x.json': '{"n":2}' } }), h1, 'Shadow byte edits change the hash');
  assert.notEqual(
    compileCache.contentHash({ ...base, figureRefs: [{ objectPath: 'fig/a.png', updatedAt: '2026-09-20' }] }),
    h1,
    'Figure version edits change the hash'
  );
  assert.notEqual(compileCache.contentHash({ ...base, compilerVersion: 'typst:9.9.9' }), h1, 'Compiler upgrades change the hash');
  assert.equal(compileCache.figureCacheKey('fig/a.png'), 'fig/a.png\nunversioned', 'Unversioned figure key');
  assert.ok(compileCache.figureCacheKey('fig/a.png', { updatedAt: 't' }).includes('updatedAt:t'), 'Stamped figure key');
  const tiny = compileCache.createBoundedCache({ maxEntries: 1, maxBytes: 10 });
  tiny.set('a', 'x', 5);
  tiny.set('b', 'y', 5);
  assert.equal(tiny.get('a'), undefined, 'Oldest entry evicted past the cap');
  assert.equal(tiny.get('b'), 'y', 'Newest entry kept');
  console.log('Cache invalidation contract verified (5 directions + bounded LRU).');

  // 3c. Wiring: every compile path sends contentHash + preferPath and honors path returns.
  const studio = fs.readFileSync(path.join(root, 'src/renderer/src/components/typst/EEstimatePrintStudio.tsx'), 'utf8');
  assert.ok(studio.includes('preferPath: true'), 'studio requests the fast path');
  assert.ok(studio.includes('contentHash({'), 'studio sends the invalidation hash');
  assert.ok(studio.includes('res.pdfPath'), 'studio honors path returns');
  assert.ok(studio.includes('sourcePath: compiledPdfPath'), 'studio download copies from cache');
  const excelSites = [
    'src/renderer/src/components/dashboard/ComponentDashboard.tsx',
    'src/renderer/src/components/dashboard/TitleDashboard.tsx',
    'src/renderer/src/components/comparative/ComparativeStatementPanel.tsx',
    'src/renderer/src/components/seigniorage/SeigniorageDashboard.tsx',
    'src/renderer/src/components/lead/LeadPrintStudioSession.tsx'
  ];
  for (const site of excelSites) {
    const source = fs.readFileSync(path.join(root, site), 'utf8');
    assert.ok(source.includes('preferPath: true'), `${site} requests the fast path`);
    assert.ok(source.includes('sourcePath: result.filePath'), `${site} saves from the cached file`);
    assert.ok(!source.includes('decodeBase64(result.data)'), `${site} has no base64 fallback`);
  }
  // Fully cleaned handlers keep no dead download code at all.
  for (const site of excelSites.slice(0, 2).concat(excelSites[4])) {
    const source = fs.readFileSync(path.join(root, site), 'utf8');
    assert.ok(!source.includes('new Blob([copy]'), `${site} keeps no blob-download fallback`);
  }
  assert.ok(!studio.includes('atob('), 'studio has no base64 fallback');
  assert.ok(!studio.includes('compiledPdfBase64'), 'studio keeps no base64 state');
  const dataSheetPrint = fs.readFileSync(path.join(root, 'src/renderer/src/lib/dataSheetPrint.ts'), 'utf8');
  assert.ok(dataSheetPrint.includes("from('ssr-figures').list("), 'figure stamps revalidate per compile');
  assert.ok(dataSheetPrint.includes('contentHash: cacheKey'), 'DATA compile sends the invalidation hash');
  const rustTypst = fs.readFileSync(path.join(root, 'src-tauri/src/typst_compile.rs'), 'utf8');
  assert.ok(!rustTypst.includes('comemo::evict'), 'memoization survives across compiles');
  assert.ok(rustTypst.includes('content_hash') && rustTypst.includes('prefer_path') && rustTypst.includes('figure_refs'), 'Rust accepts hash + fast-path + figure refs');
  assert.ok(rustTypst.includes('pdf_path') && rustTypst.includes('cache_hit'), 'Rust reports path + hit flag');
  const rustExcel = readExcelRust(root);
  assert.ok(rustExcel.includes('prefer_path') && rustExcel.includes('file_path'), 'Excel accepts the fast path');
  const rustExport = fs.readFileSync(path.join(root, 'src-tauri/src/export.rs'), 'utf8');
  assert.ok(rustExport.includes('source_path') && rustExport.includes('e-estimate-compile-cache'), 'Export copies from the guarded cache dir');
  console.log('Fast-path wiring verified (studio + 5 Excel sites + 3 Rust commands).');

  const jsonPath = path.join(root, 'scratch/test-input.json');
  const testFilePath = path.join(root, 'scratch/test-workbook-output.xlsx');
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

  const cacheRoot = process.env.LOCALAPPDATA || path.join(os.homedir(), '.cache');
  const exePath = path.join(cacheRoot, 'e-estimate', 'cargo-target', 'debug', 'e-estimate.exe');
  assert(fs.existsSync(exePath), `Native binary must exist at ${exePath}`);

  // Run native Rust compiler
  const compileOut = execSync(`"${exePath}" --compile-excel "${jsonPath}" "${testFilePath}"`, { encoding: 'utf8' });
  console.log('Native Rust Excel compilation:', compileOut.trim());
  assert(fs.existsSync(testFilePath), 'Output XLSX must be produced by native Rust engine');
  const bytes = fs.readFileSync(testFilePath);
  assert(bytes.length > 1000);
  console.log('Native rust_xlsxwriter workbook built successfully, byte size:', bytes.length);

  // Test Export to PDF via Excel COM
  const pdfOut = path.join(root, 'scratch/test-workbook-output.pdf');
  const psScript = `
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Open('${testFilePath.replace(/\//g, '\\\\')}')
  $ws = $wb.Worksheets.Item(1)
  $ws.ExportAsFixedFormat(0, '${pdfOut.replace(/\//g, '\\\\')}')
  $wb.Close($false)
  Write-Host 'SUCCESS'
} catch {
  Write-Host 'ERROR:' $_.Exception.Message
} finally {
  $xl.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
`;
  fs.writeFileSync(path.join(root, 'scratch/test-export-pdf.ps1'), psScript);
  const res = execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(root, 'scratch/test-export-pdf.ps1')}"`, { encoding: 'utf8' });
  console.log('PDF export result:', res.trim());
  assert(fs.existsSync(pdfOut) && fs.statSync(pdfOut).size > 10000, 'PDF must be generated');
  console.log('PDF generated cleanly, size:', fs.statSync(pdfOut).size);
  console.log('ALL TESTS PASSED!');
}

runTest().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
