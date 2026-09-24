const fs = require('node:fs')
const path = require('node:path')

/** Read the modular Rust Excel compiler as one searchable contract string. */
module.exports = function readExcelRust(root) {
  const base = path.join(root, 'src-tauri', 'src', 'excel_compile')
  const files = []
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(target)
      else if (entry.isFile() && entry.name.endsWith('.rs')) files.push(target)
    }
  }
  visit(base)
  return files
    .sort()
    .map((file) => `// ${path.relative(base, file)}\n${fs.readFileSync(file, 'utf8')}`)
    .join('\n')
}
