// Standalone Node tests exercise the same compiled Rust engine as the screen.
const fs = require('node:fs')
const { ensureCanalSectionEngine } = require('./build-canal-section-engine.cjs')
globalThis.__canalSectionEngine = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(ensureCanalSectionEngine())),{}).exports
