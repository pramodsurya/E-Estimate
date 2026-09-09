const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/renderer/src/lib/tauriApi.ts'), 'utf8')

assert.match(
  source,
  /invoke<SaveResult>\('project_save',\s*\{\s*payload:\s*\{\s*data,\s*currentPath,\s*name\s*\}\s*\}\)/s,
  'project_save must send the SavePayload under Tauri’s required payload argument'
)
assert.match(
  source,
  /invoke<SaveResult>\('project_save_as',\s*\{\s*payload:\s*\{\s*data,\s*name\s*\}\s*\}\)/s,
  'project_save_as must send the SavePayload under Tauri’s required payload argument'
)
assert.match(
  fs.readFileSync(path.join(root, 'src-tauri/src/project.rs'), 'utf8'),
  /pub async fn project_save\(app: tauri::AppHandle, payload: SavePayload\)/,
  'desktop command still declares payload as its argument'
)
assert.match(
  source,
  /invoke\('export_pdf',\s*\{\s*payload:\s*\{\s*data,\s*name,\s*defaultPath\s*\}\s*\}\)/s,
  'export_pdf must send ExportPayload under Tauri’s required payload argument'
)
assert.match(
  source,
  /invoke\('export_workbook',\s*\{\s*payload:\s*\{\s*data,\s*name,\s*defaultPath\s*\}\s*\}\)/s,
  'export_workbook must send ExportPayload under Tauri’s required payload argument'
)
assert.match(
  fs.readFileSync(path.join(root, 'src-tauri/src/export.rs'), 'utf8'),
  /pub async fn export_pdf\(app: tauri::AppHandle, payload: ExportPayload\)/,
  'desktop PDF export command still declares payload as its argument'
)

console.log('Tauri project save and export bridges supply the required payload argument')
