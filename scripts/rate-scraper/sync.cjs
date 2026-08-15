'use strict'

/**
 * Discover the PRED monthly steel/cement circulars and record the new ones.
 *
 * This job does not read rates and does not price anything. It answers one
 * question — which circulars exist that we have not taken in yet — downloads
 * those, and files them for extraction and review. Publishing a rate is a
 * separate, human step (see scripts/sql/material_rate_documents.sql for why).
 *
 * It is safe to run repeatedly: a document already recorded with the same
 * content hash is skipped. A document whose hash has *changed* is flagged
 * rather than quietly re-imported — the department reissuing a circular is a
 * thing a person should see.
 *
 * Usage
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/rate-scraper/sync.cjs
 *
 * Options
 *   --since=YYYY   ignore circulars older than this year (default 2024)
 *   --limit=N      download at most N new circulars this run (default 24)
 *   --dry-run      report what would happen; write nothing, download nothing
 */

const crypto = require('node:crypto')
const { parseRateIndex } = require('./parseIndex.cjs')

const INDEX_URL = 'https://www.pred.telangana.gov.in/steel_cement_rates.php'
const STORAGE_BUCKET = 'material-rate-circulars'
/**
 * Identify the job to the site it is fetching from, and give a contact route.
 * A department server should be able to see who is asking and why.
 */
// Header values are ByteString: anything above U+00FF throws, so no dashes
// prettier than a hyphen belong here.
const USER_AGENT =
  'E-Estimate-rate-sync/1.0 (+https://github.com/pramodsurya/E-Estimate; monthly steel/cement circular discovery)'

function readOptions(argv) {
  const get = (name, fallback) => {
    const found = argv.find((arg) => arg.startsWith(`--${name}=`))
    return found ? found.slice(name.length + 3) : fallback
  }
  return {
    since: Number(get('since', '2024')),
    limit: Number(get('limit', '24')),
    dryRun: argv.includes('--dry-run')
  }
}

async function fetchWithRetry(url, init = {}, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { 'user-agent': USER_AGENT, ...(init.headers ?? {}) }
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
      return response
    } catch (reason) {
      lastError = reason
      if (attempt === attempts) break
      // Back off rather than hammering a government server that is struggling.
      await new Promise((resolve) => setTimeout(resolve, attempt * 4000))
    }
  }
  throw lastError
}

/** Minimal PostgREST access; the job needs four calls and no client library. */
function supabaseClient(url, serviceKey) {
  const base = url.replace(/\/$/, '')
  const headers = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json'
  }
  return {
    async select(table, query) {
      const response = await fetchWithRetry(`${base}/rest/v1/${table}?${query}`, { headers })
      return response.json()
    },
    async insert(table, rows) {
      const response = await fetchWithRetry(`${base}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...headers, prefer: 'return=representation' },
        body: JSON.stringify(rows)
      })
      return response.json()
    },
    async patch(table, query, patch) {
      const response = await fetchWithRetry(`${base}/rest/v1/${table}?${query}`, {
        method: 'PATCH',
        headers: { ...headers, prefer: 'return=representation' },
        body: JSON.stringify(patch)
      })
      return response.json()
    },
    async upload(path, bytes, contentType) {
      const response = await fetchWithRetry(
        `${base}/storage/v1/object/${STORAGE_BUCKET}/${encodeURIComponent(path)}`,
        {
          method: 'POST',
          headers: { ...headers, 'content-type': contentType, 'x-upsert': 'true' },
          body: bytes
        }
      )
      return response.json()
    }
  }
}

async function main() {
  const options = readOptions(process.argv.slice(2))
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!options.dryRun && (!url || !key)) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dry-run).'
    )
  }
  const db = options.dryRun ? null : supabaseClient(url, key)

  console.log(`Reading ${INDEX_URL}`)
  const html = await (await fetchWithRetry(INDEX_URL)).text()
  const { documents, unreadable } = parseRateIndex(html, INDEX_URL)
  console.log(`  ${documents.length} circulars listed, ${unreadable.length} unreadable`)
  for (const row of unreadable) {
    // Never silently dropped: an unreadable label may be the month somebody is
    // waiting for.
    console.warn(`  ! could not read "${row.label}": ${row.error}`)
  }

  const wanted = documents.filter((row) => row.year >= options.since)
  console.log(`  ${wanted.length} at or after ${options.since}`)

  const known = db
    ? await db.select(
        'material_rate_document',
        'select=source_url,content_sha256,status&limit=10000'
      )
    : []
  const knownByUrl = new Map(known.map((row) => [row.source_url, row]))

  const fresh = wanted.filter((row) => !knownByUrl.has(row.url))
  console.log(`  ${fresh.length} not seen before`)
  if (fresh.length === 0) {
    console.log('Nothing new.')
    return
  }

  const batch = fresh.slice(0, options.limit)
  if (batch.length < fresh.length) {
    console.log(`  taking ${batch.length} this run; re-run for the rest`)
  }

  let recorded = 0
  let changed = 0
  for (const row of batch) {
    if (options.dryRun) {
      console.log(`  would take ${row.label} (${row.effectiveFrom}) ${row.url}`)
      continue
    }
    try {
      const response = await fetchWithRetry(row.url)
      const bytes = Buffer.from(await response.arrayBuffer())
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')

      // A hash we already hold under a different URL means the same circular
      // was relinked; record it, but say so.
      const duplicate = known.find((entry) => entry.content_sha256 === sha256)
      const storagePath = `${row.effectiveFrom.slice(0, 4)}/${row.effectiveFrom}-${sha256.slice(0, 12)}.pdf`
      await db.upload(storagePath, bytes, 'application/pdf')
      await db.insert('material_rate_document', [
        {
          source_url: row.url,
          source_label: row.label,
          effective_from: row.effectiveFrom,
          content_sha256: sha256,
          content_bytes: bytes.length,
          storage_path: storagePath,
          status: 'downloaded',
          status_note: duplicate
            ? `identical to a circular already held (${duplicate.source_url})`
            : row.note ?? null,
          downloaded_at: new Date().toISOString()
        }
      ])
      recorded += 1
      if (duplicate) changed += 1
      console.log(`  took ${row.label} — ${bytes.length} bytes, sha ${sha256.slice(0, 12)}`)
    } catch (reason) {
      // One bad document must not end the run; the rest are still worth having.
      console.error(`  ! ${row.label} failed: ${reason instanceof Error ? reason.message : reason}`)
      await db
        .insert('material_rate_document', [
          {
            source_url: row.url,
            source_label: row.label,
            effective_from: row.effectiveFrom,
            status: 'failed',
            status_note: reason instanceof Error ? reason.message : String(reason)
          }
        ])
        .catch(() => undefined)
    }
  }

  console.log(
    `Recorded ${recorded} circular(s)` +
      (changed > 0 ? `, ${changed} identical to one already held` : '') +
      '. Nothing is published until each is extracted and approved.'
  )
}

main().catch((reason) => {
  console.error(reason)
  process.exit(1)
})
