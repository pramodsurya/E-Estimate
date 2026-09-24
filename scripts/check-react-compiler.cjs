#!/usr/bin/env node
/**
 * Strict React Compiler check.
 *
 * Runs babel-plugin-react-compiler over every renderer source file with
 * `panicThreshold: 'critical_errors'` and a logger that records every
 * non-success event. A thrown panic alone is not enough: the compiler also
 * skips functions for non-critical reasons (unsupported syntax such as
 * try/finally, lint-rule suppressions, ...), and a skipped component gets no
 * memoization at all. Those skips must fail the check, not pass silently.
 *
 * Usage: node scripts/check-react-compiler.cjs
 */
const fs = require('fs')
const path = require('path')
const parser = require('@babel/parser')
const { transformFromAstSync } = require('@babel/core')
const reactCompiler = require('babel-plugin-react-compiler')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src/renderer/src')
const plugin = reactCompiler.default ?? reactCompiler

/**
 * Adoption ratchet: functions the compiler currently cannot lower (mostly
 * `try/catch/finally` shapes). Skipped functions get NO memoization, so their
 * manual useMemo/useCallback must stay until the shape is reworked. Lower this
 * as skips are fixed; exceeding it fails the check.
 */
const MAX_SKIPPED_FUNCTIONS = 63

function collectFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      out.push(...collectFiles(full))
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

const files = collectFiles(SRC)
const failures = []
const skips = []
const optOuts = []

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, file)
  const lines = code.split(/\r?\n/)
  if (code.includes("'use no memo'") || code.includes('"use no memo"')) {
    const line = lines.findIndex((l) => l.includes('use no memo')) + 1
    optOuts.push(`${rel}:${line}`)
  }
  const events = []
  try {
    const ast = parser.parse(code, {
      sourceFilename: file,
      plugins: ['typescript', 'jsx'],
      sourceType: 'module'
    })
    transformFromAstSync(ast, code, {
      filename: file,
      highlightCode: false,
      code: false,
      configFile: false,
      babelrc: false,
      plugins: [
        [
          plugin,
          {
            panicThreshold: 'critical_errors',
            logger: {
              logEvent(filename, event) {
                if (event.kind === 'CompileSuccess') return
                events.push(event)
              }
            }
          }
        ]
      ],
      sourceType: 'module'
    })
  } catch (error) {
    const detail = String(error.message || error)
      .split('\n')
      .slice(0, 12)
      .join('\n')
    failures.push({ file: rel, detail })
    continue
  }
  for (const event of events) {
    const start = event.fnLoc?.start.line ?? 1
    const reason =
      event.detail?.reason ??
      event.detail?.description ??
      event.detail?.category ??
      event.kind
    skips.push({
      file: rel,
      line: start,
      header: lines[start - 1]?.trim().slice(0, 120) ?? '',
      kind: event.kind,
      reason: String(reason).slice(0, 200)
    })
  }
}

if (failures.length > 0) {
  console.error(`React Compiler threw on ${failures.length} file(s):\n`)
  for (const failure of failures) {
    console.error(`--- ${failure.file}\n${failure.detail}\n`)
  }
  process.exit(1)
}

if (skips.length > MAX_SKIPPED_FUNCTIONS) {
  console.error(
    `React Compiler skipped ${skips.length} function(s), above the ${MAX_SKIPPED_FUNCTIONS} baseline:\n`
  )
  for (const skip of skips) {
    console.error(`--- ${skip.file}:${skip.line}  [${skip.kind}]`)
    console.error(`    ${skip.reason}`)
    console.error(`    ${skip.header}\n`)
  }
  process.exit(1)
}

console.log(`React Compiler strict check OK: ${files.length} files, no panics.`)
if (skips.length > 0) {
  console.log(
    `Skipped functions: ${skips.length}/${MAX_SKIPPED_FUNCTIONS} baseline (these keep manual memoization).`
  )
  if (skips.length < MAX_SKIPPED_FUNCTIONS) {
    console.log(`  Baseline can drop to ${skips.length}.`)
  }
}
if (optOuts.length > 0) {
  console.log(`Intentional 'use no memo' opt-outs (${optOuts.length}):`)
  for (const optOut of optOuts) console.log(`  ${optOut}`)
}
process.exit(0)
