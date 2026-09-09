const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const resources = path.join(root, 'release', 'win-unpacked', 'resources')
const engine = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(resources, 'analysis-engine', 'bund-analysis.exe')

assert.ok(fs.existsSync(engine), `packaged analysis engine is missing: ${engine}`)

const baseRequest = {
  schemaVersion: 1,
  runId: 'packaged-engine-smoke',
  case: 'construction',
  slope: 'both',
  geometry: {
    ground: [[-25, 90], [25, 90]],
    embankment: [[-12, 90], [-2, 95], [2, 95], [12, 90]],
    materialPolygons: [
      {
        role: 'embankment',
        materialIndex: 0,
        points: [[-12, 90], [-2, 95], [2, 95], [12, 90]]
      },
      {
        role: 'foundation',
        materialIndex: 1,
        points: [[-25, 80], [25, 80], [25, 90], [-25, 90]]
      }
    ]
  },
  water: { reservoirLevel: null, foundationThicknessM: 10 },
  materials: [
    {
      name: 'Embankment',
      gamma: 18,
      gammaSat: 19.5,
      cPrime: 10,
      phiPrime: 26
    },
    {
      name: 'Foundation',
      gamma: 19,
      gammaSat: 20,
      cPrime: 15,
      phiPrime: 28
    }
  ],
  controls: { analysisType: 'lem', method: 'ordinary', slices: 20 }
}

const requests = [
  baseRequest,
  {
    ...baseRequest,
    runId: 'packaged-engine-seepage-smoke',
    case: 'steady-seepage',
    slope: 'downstream',
    water: {
      reservoirLevel: 94,
      tailWaterMax: 90,
      foundationThicknessM: 10
    },
    materials: baseRequest.materials.map((material) => ({
      ...material,
      kx: 0.0001,
      ky: 0.0001
    }))
  }
]

const statuses = []
let engineVersion = ''
for (const request of requests) {
  const run = spawnSync(engine, [], {
    input: JSON.stringify(request),
    encoding: 'utf8',
    timeout: 180_000,
    windowsHide: true
  })

  assert.equal(run.error, undefined, run.error?.message)
  assert.equal(
    run.status,
    0,
    `packaged engine exited ${run.status}\n${run.stderr || run.stdout}`
  )

  const lastLine = run.stdout.trim().split(/\r?\n/).at(-1)
  assert.ok(lastLine, `packaged engine returned no JSON\n${run.stderr}`)
  const response = JSON.parse(lastLine)
  assert.equal(response.schemaVersion, 1)
  assert.equal(response.runId, request.runId)
  assert.ok(
    ['ok', 'not-evaluated'].includes(response.status),
    `packaged engine returned ${response.status}: ${response.message || ''}`
  )
  assert.equal(response.engine?.name, 'XSLOPE')
  if (request.case === 'steady-seepage' && response.status === 'ok') {
    assert.ok(response.seepField?.nodes?.length > 0, 'seepage mesh is present')
    assert.ok(response.phreaticLine?.length > 0, 'phreatic line is present')
  }
  statuses.push(`${request.case}=${response.status}`)
  engineVersion = response.engine.version
}

console.log(
  `test-packaged-analysis-engine: ${statuses.join(', ')}; ` +
    `engine ${engineVersion}; packaged sidecar is executable`
)
