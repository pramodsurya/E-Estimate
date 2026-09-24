#!/usr/bin/env node
/**
 * Removes manual useMemo/useCallback calls from renderer sources.
 *
 * Transformations (semantics preserving):
 *   useCallback(fn, deps)            -> (fn)
 *   useMemo(() => expr, deps)        -> (expr)
 *   useMemo(fn, deps)                -> (fn)()
 *
 * Calls with explicit type arguments are skipped (report only) since
 * dropping the annotation can change inferred types.
 *
 * Usage:
 *   node scripts/remove-manual-memo.cjs          # dry run, list edits
 *   node scripts/remove-manual-memo.cjs --apply  # write changes
 */
const fs = require('fs')
const path = require('path')
const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src/renderer/src')
const APPLY = process.argv.includes('--apply')

const PARSE_OPTIONS = {
  sourceType: 'module',
  plugins: ['typescript', 'jsx'],
  ranges: true
}

function parse(code, filename) {
  return parser.parse(code, { ...PARSE_OPTIONS, sourceFilename: filename })
}

function collectFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__snapshots__') continue
      out.push(...collectFiles(full))
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

function reactHookImports(ast) {
  const locals = new Map()
  traverse(ast, {
    ImportDeclaration(p) {
      if (p.node.source.value !== 'react') return
      for (const spec of p.node.specifiers) {
        if (spec.type !== 'ImportSpecifier') continue
        const imported = spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value
        if (imported === 'useMemo' || imported === 'useCallback') {
          locals.set(spec.local.name, { kind: imported, spec })
        }
      }
    }
  })
  return locals
}

function applyEdits(code, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  let out = code
  for (const edit of sorted) {
    out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end)
  }
  return out
}

function transformPass(code, filename, skipped) {
  const ast = parse(code, filename)
  const locals = reactHookImports(ast)
  const edits = []
  traverse(ast, {
    CallExpression(p) {
      const callee = p.node.callee
      if (callee.type !== 'Identifier') return
      const entry = locals.get(callee.name)
      if (!entry) return
      const binding = p.scope.getBinding(callee.name)
      if (!binding || binding.path.node !== entry.spec) return
      const args = p.node.arguments
      if (args.length === 0) return

      const typeArgs = p.node.typeArguments || p.node.typeParameters
      if (entry.kind === 'useMemo' && typeArgs) {
        skipped.push({ filename, line: p.node.loc.start.line, text: code.slice(p.node.start, p.node.end).split('\n')[0] })
        return
      }

      let replacement
      if (entry.kind === 'useCallback') {
        replacement = `(${code.slice(args[0].start, args[0].end)})`
      } else if (args[0].type === 'ArrowFunctionExpression' && args[0].body.type !== 'BlockStatement') {
        replacement = `(${code.slice(args[0].body.start, args[0].body.end)})`
      } else {
        replacement = `(${code.slice(args[0].start, args[0].end)})()`
      }
      edits.push({ start: p.node.start, end: p.node.end, replacement, line: p.node.loc.start.line })
      p.skip()
    }
  })
  return { code: applyEdits(code, edits), editCount: edits.length }
}

function removeUnusedImports(code, filename) {
  const ast = parse(code, filename)
  const removals = []
  const notes = []

  traverse(ast, {
    ImportDeclaration(p) {
      if (p.node.source.value !== 'react') return
      const hookSpecs = p.node.specifiers.filter(
        (s) =>
          s.type === 'ImportSpecifier' &&
          ((s.imported.type === 'Identifier' && (s.imported.name === 'useMemo' || s.imported.name === 'useCallback')) ||
            s.imported.value === 'useMemo' ||
            s.imported.value === 'useCallback')
      )
      const unused = hookSpecs.filter((spec) => {
        const binding = p.scope.getBinding(spec.local.name)
        return binding && binding.referencePaths.length === 0
      })
      if (unused.length === 0) return

      const remaining = p.node.specifiers.filter((s) => !unused.includes(s))
      if (remaining.length === 0) {
        const end = code[p.node.end] === '\n' ? p.node.end + 1 : p.node.end
        removals.push({ start: p.node.start, end, replacement: '' })
        notes.push(`removed import statement: ${code.slice(p.node.start, p.node.end)}`)
        return
      }

      for (const spec of unused) {
        let i = spec.end
        while (i < code.length && /\s/.test(code[i])) i++
        if (code[i] === ',') {
          removals.push({ start: spec.start, end: i + 1, replacement: '' })
        } else {
          let j = spec.start - 1
          while (j >= 0 && /\s/.test(code[j])) j--
          if (code[j] === ',') {
            removals.push({ start: j, end: spec.end, replacement: '' })
          } else {
            removals.push({ start: spec.start, end: spec.end, replacement: '' })
          }
        }
        notes.push(`removed import specifier: ${spec.local.name}`)
      }
    }
  })

  const updated = applyEdits(code, removals)
  const tidied = updated.replace(/(import\s*\{)([\s\S]*?)(\}\s*from\s*'react')/g, (match, open, body, close) => {
    if (!/^[ \t]+$/m.test(body)) return match
    return open + body.split(/\r?\n/).filter((line) => !/^[ \t]+$/.test(line)).join('\n') + close
  })
  try {
    parse(tidied, filename)
  } catch (err) {
    notes.push(`import cleanup skipped (parse failed: ${err.message})`)
    return { code, notes: [] }
  }
  return { code: tidied, notes }
}

function processFile(file) {
  const original = fs.readFileSync(file, 'utf8')
  let code = original
  let editCount = 0
  const skipped = []

  for (let pass = 0; pass < 10; pass++) {
    let result
    try {
      result = transformPass(code, file, skipped)
    } catch (err) {
      console.error(`  ! parse failed, skipped: ${err.message}`)
      return { changed: false, edits: 0, skipped }
    }
    if (result.editCount === 0) break
    code = result.code
    editCount += result.editCount
  }

  if (editCount === 0) return { changed: false, edits: 0, skipped }

  const cleanup = removeUnusedImports(code, file)
  code = cleanup.code

  try {
    parse(code, file)
  } catch (err) {
    console.error(`  ! post-transform parse failed, skipped: ${err.message}`)
    return { changed: false, edits: 0, skipped }
  }

  if (code === original) return { changed: false, edits: 0, skipped }
  if (APPLY) fs.writeFileSync(file, code)
  return { changed: true, edits: editCount, skipped }
}

const files = collectFiles(SRC)
let totalEdits = 0
let totalFiles = 0
const allSkipped = []

for (const file of files) {
  const rel = path.relative(ROOT, file)
  const result = processFile(file)
  if (result.changed) {
    totalEdits += result.edits
    totalFiles++
    console.log(`  ${APPLY ? 'rewrote' : 'would rewrite'} ${rel} (${result.edits} call${result.edits === 1 ? '' : 's'})`)
  }
  allSkipped.push(...result.skipped)
}

console.log(`\n${APPLY ? 'Rewrote' : 'Would rewrite'} ${totalFiles} files, ${totalEdits} useMemo/useCallback calls.`)
if (allSkipped.length > 0) {
  console.log(`\nSkipped ${allSkipped.length} typed useMemo call(s):`)
  for (const s of allSkipped) {
    console.log(`  ${path.relative(ROOT, s.filename)}:${s.line}  ${s.text.trim()}`)
  }
}
if (!APPLY) console.log('\nDry run. Re-run with --apply to write changes.')
