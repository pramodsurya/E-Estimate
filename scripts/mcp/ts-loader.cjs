const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');

const root = path.resolve(__dirname, '../..');
const moduleCache = new Map();

const mockUniverCore = {
  LocaleType: { EN_US: 'enUS' },
  BooleanNumber: { FALSE: 0, TRUE: 1 },
  CellValueType: { STRING: 1, NUMBER: 2, BOOLEAN: 3, FORCE_STRING: 4 }
};

const supabaseUrl = 'https://hqddsxnykndgcmxwqwmn.supabase.co';
const supabaseKey = 'sb_publishable_TUvTjZ--anWcRNGSOnJGhw_q4Z3z9ES';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function loadTs(relPath, customMocks = {}) {
  const fullPath = path.resolve(root, relPath);
  if (moduleCache.has(fullPath)) {
    return moduleCache.get(fullPath);
  }

  let source = fs.readFileSync(fullPath, 'utf8');
  source = source.replace(/import\.meta\.env/g, `({ VITE_SUPABASE_URL: "${supabaseUrl}", VITE_SUPABASE_KEY: "${supabaseKey}" })`);

  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: fullPath
  });

  const loaded = new Module(fullPath, module);
  loaded.filename = fullPath;
  loaded.paths = Module._nodeModulePaths(path.dirname(fullPath));
  loaded.exports = {};
  moduleCache.set(fullPath, loaded.exports);

  loaded.require = (request) => {
    if (request in customMocks) return customMocks[request];
    if (request === '@univerjs/core') return mockUniverCore;
    if (request === './supabase' || request.endsWith('/supabase')) {
      return { supabase };
    }
    if (request.startsWith('.')) {
      const dir = path.dirname(fullPath);
      const candidates = [
        path.resolve(dir, request + '.ts'),
        path.resolve(dir, request + '.tsx'),
        path.resolve(dir, request, 'index.ts'),
        path.resolve(dir, request, 'index.tsx'),
        path.resolve(dir, request)
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
          return loadTs(path.relative(root, cand), customMocks);
        }
      }
    }
    return Module.createRequire(fullPath)(request);
  };

  loaded._compile(outputText, fullPath);
  moduleCache.set(fullPath, loaded.exports);
  return loaded.exports;
}

let cachedDashboardSync = null;
function getDashboardSync() {
  if (!cachedDashboardSync) {
    cachedDashboardSync = loadTs('src/renderer/src/lib/dashboardSync.ts');
  }
  return cachedDashboardSync;
}

module.exports = {
  loadTs,
  supabase,
  getDashboardSync
};
