import { spawn } from 'child_process'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { app } from 'electron'
import path from 'path'

/**
 * Launch the headless XSLOPE bridge for one bund simulation run.
 *
 * The sidecar is a Python process that reads one JSON request on stdin and
 * answers with exactly one JSON response on stdout; only the main process may
 * start it, and no shell is involved in the spawn so request payloads are
 * never interpolated into a command line. In a packaged build the bridge runs
 * from resources/analysis beside a bundled interpreter; in development the
 * repository's own analysis script and the machine's `python` are used.
 */

export type BundSimulationCaseId =
  | 'construction'
  | 'partial-pool'
  | 'drawdown-us'
  | 'drawdown-ds'
  | 'steady-seepage'
  | 'rainfall'
  | 'quake-seepage'
  | 'quake-full'

export interface BundSimulationRequest {
  schemaVersion: number
  runId: string
  case: BundSimulationCaseId
  geometry: {
    ground: [number, number][]
    embankment: [number, number][]
    materialPolygons: {
      role:
        | 'embankment'
        | 'foundation'
        | 'hearting'
        | 'cutoff-trench'
        | 'rocktoe'
        | 'rocktoe-filter'
      materialIndex: number
      points: [number, number][]
    }[]
  }
  water: {
    reservoirLevel?: number | null
    tailWaterMax?: number | null
    tailWaterMin?: number | null
    minHeadwater?: number | null
    rainfallLevel?: number | null
    foundationThicknessM?: number
  }
  loading?: { kh: number; kv: number; source?: string }
  /** Which slope the case checks — restricts the slip-circle search face. */
  slope?: 'upstream' | 'downstream' | 'both'
  foundationSource?: 'assumed' | 'tested'
  foundationReference?: string
  materials: Record<string, unknown>[]
  controls:
    | {
        analysisType: 'lem'
        method: 'ordinary' | 'bishop' | 'janbu' | 'corps' | 'lowe' | 'spencer' | 'mprice'
        slices: number
      }
    | {
        analysisType: 'fem-ssrm'
        method: 'fem-ssrm'
        meshSizeM: number
        tolerance: number
        maxIterations: number
      }
}

export interface BundFemField {
  nodes: [number, number][]
  triangles: [number, number, number][]
  dispMag?: number[]
  dispX?: number[]
  dispY?: number[]
  shearStrain?: number[]
  plastic?: boolean[]
  deformScale?: number
}

/** Seepage mesh + total-head field for XSLOPE-style filled-contour drawing. */
export interface BundSeepField {
  nodes: [number, number][]
  triangles: [number, number, number][]
  /** Total hydraulic head per node (m). */
  head: number[]
}

export type BundSimulationResponse =
  | {
      schemaVersion: number
      runId: string
      status: 'ok'
      engine: { name: string; version: string; bridgeVersion: number }
      analysisType: 'lem' | 'fem-ssrm'
      method: string
      factorOfSafety: number
      /** Pore-pressure treatment actually solved, recorded on the run. */
      treatment?: string
      criticalSurface: {
        type: string
        center: [number, number] | null
        radius: number | null
        surface: [number, number][]
      } | null
      slices: {
        xLeft: number
        topY: number
        baseY: number
        xRight: number
        weight: number
      }[]
      phreaticLine: [number, number][]
      /** Primary field: pre-drawdown for Case III, solved field otherwise. */
      seepField?: BundSeepField
      /** Post-drawdown boundary field used by the staged Case III procedure. */
      postDrawdownPhreaticLine?: [number, number][]
      postDrawdownSeepField?: BundSeepField
      warnings: string[]
      diagnostics: Record<string, unknown>
      femResult?: {
        finalInterval: [number, number] | null
        failureCriterion: string
        iterations: number | null
        nodeCount: number | null
        elementCount: number | null
        maxDisplacementM: number | null
        /** At-failure mesh + fields for the native FEM diagram. */
        field?: BundFemField
      }
    }
  | {
      schemaVersion: number
      runId: string
      status: 'error' | 'not-evaluated'
      message?: string
      engine?: { name: string; version: string; bridgeVersion: number }
      warnings?: string[]
      diagnostics?: Record<string, unknown>
    }

export type BundSimulationPhase =
  | 'starting'
  | 'preparing-model'
  | 'seepage-stage-1'
  | 'seepage-stage-2'
  | 'slip-search'
  | 'strength-reduction'
  | 'finalizing'

export interface BundSimulationProgress {
  runId: string
  phase: BundSimulationPhase
  message: string
  at: string
}

const RUN_TIMEOUT_MS = 10 * 60 * 1000

interface ActiveBundProcess {
  child: ChildProcessWithoutNullStreams
  cancelRequested: boolean
}

/** Main-process ownership keeps the solver alive across renderer navigation. */
const activeBundProcesses = new Map<string, ActiveBundProcess>()

export function hasActiveBundSimulations(): boolean {
  return activeBundProcesses.size > 0
}

export function cancelBundSimulation(runId: string): boolean {
  const active = activeBundProcesses.get(runId)
  if (!active) return false
  active.cancelRequested = true
  active.child.kill()
  return true
}

export function cancelAllBundSimulations(): void {
  for (const [runId] of activeBundProcesses) cancelBundSimulation(runId)
}

function pythonCandidates(): string[] {
  // A packaged build ships its own interpreter under resources/python; dev
  // falls back to whatever `python` resolves to on PATH.
  const bundled = path.join(process.resourcesPath || '', 'python', 'python.exe')
  return [
    ...(existsSync(bundled) ? [bundled] : []),
    process.env.EESTIMATE_PYTHON || 'python'
  ]
}

function sidecarScript(): string {
  const packaged = path.join(process.resourcesPath || '', 'analysis', 'bund_analysis.py')
  if (existsSync(packaged)) return packaged
  return path.join(app.getAppPath(), 'analysis', 'bund_analysis.py')
}

export function runBundSimulation(
  request: BundSimulationRequest,
  onProgress?: (progress: BundSimulationProgress) => void
): Promise<BundSimulationResponse> {
  return new Promise((resolve) => {
    const script = sidecarScript()
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastProgressPhase: BundSimulationPhase | null = null
    const progress = (phase: BundSimulationPhase, message: string): void => {
      if (phase === lastProgressPhase) return
      lastProgressPhase = phase
      onProgress?.({
        runId: request.runId,
        phase,
        message,
        at: new Date().toISOString()
      })
    }
    const finish = (response: BundSimulationResponse): void => {
      if (!settled) {
        settled = true
        if (timer) clearTimeout(timer)
        activeBundProcesses.delete(request.runId)
        resolve(response)
      }
    }

    if (activeBundProcesses.has(request.runId)) {
      resolve({
        schemaVersion: 1,
        runId: request.runId,
        status: 'error',
        message: 'This simulation run is already active.'
      })
      return
    }

    progress('starting', 'Starting the XSLOPE analysis engine.')
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(pythonCandidates()[0], ['-X', 'utf8', script], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })
    } catch (err) {
      finish({
        schemaVersion: 1,
        runId: request.runId,
        status: 'error',
        message: `Could not start the analysis engine: ${String(err)}`
      })
      return
    }
    const active: ActiveBundProcess = { child, cancelRequested: false }
    activeBundProcesses.set(request.runId, active)
    progress('preparing-model', 'Preparing the section geometry and material model.')

    let stdout = ''
    let stderrTail = ''
    let seepageSolveCount = 0
    timer = setTimeout(() => {
      child.kill()
      finish({
        schemaVersion: 1,
        runId: request.runId,
        status: 'error',
        message: 'The analysis timed out.'
      })
    }, RUN_TIMEOUT_MS)

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      // Kept only for diagnostics; never shown raw to the user.
      stderrTail = (stderrTail + chunk).slice(-4000)
      if (/Solving\s+(?:UNCONFINED|CONFINED)\s+seep problem/i.test(chunk)) {
        seepageSolveCount += 1
        progress(
          seepageSolveCount === 1 ? 'seepage-stage-1' : 'seepage-stage-2',
          seepageSolveCount === 1
            ? 'Solving the initial seepage and pore-pressure field.'
            : 'Solving the post-drawdown seepage boundary field.'
        )
      } else if (/Searching for the critical|grid seed|iteration\s+\d+/i.test(chunk)) {
        progress('slip-search', 'Searching trial slip circles for the critical surface.')
      } else if (/SSRM|strength reduction/i.test(chunk)) {
        progress('strength-reduction', 'Running the finite-element strength-reduction search.')
      }
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      finish({
        schemaVersion: 1,
        runId: request.runId,
        status: 'error',
        message:
          `Could not run the analysis engine (${String(err)}). ` +
          'Make sure Python with the xslope package is installed.'
      })
    })
    child.on('close', () => {
      if (active.cancelRequested) {
        finish({
          schemaVersion: 1,
          runId: request.runId,
          status: 'not-evaluated',
          message: 'Simulation cancelled by the user.',
          warnings: [],
          diagnostics: {}
        })
        return
      }
      progress('finalizing', 'Reading and storing the completed analysis result.')
      try {
        const parsed = JSON.parse(stdout.trim().split('\n').pop() || '') as BundSimulationResponse
        if (parsed && parsed.schemaVersion === 1) finish(parsed)
        else throw new Error('unsupported schema')
      } catch {
        finish({
          schemaVersion: 1,
          runId: request.runId,
          status: 'error',
          message: 'The analysis engine returned an unreadable result.',
          diagnostics: { stderrTail }
        })
      }
    })

    child.stdin.write(JSON.stringify(request))
    child.stdin.end()
  })
}
