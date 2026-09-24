import type { EestimateProject } from '../../../types/project'

type WorkerResult =
  | { ok: true; inputs: Record<string, string> }
  | { ok: false; error: string }

/** Build large bund geometry away from the renderer's event loop. */
export function prepareBundCompileInputs(project: EestimateProject, nodeId: string): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./bundCompile.worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    const finish = (result: WorkerResult | Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      worker.terminate()
      if (result instanceof Error) reject(result)
      else if (result.ok) resolve(result.inputs)
      else reject(new Error(result.error))
    }
    const timeout = setTimeout(() => finish(new Error('Bund preparation timed out. Please retry Print Studio.')), 120_000)
    worker.onmessage = (event: MessageEvent<WorkerResult>) => finish(event.data)
    worker.onerror = (event) => finish(new Error(event.message || 'Bund preparation worker failed.'))
    worker.onmessageerror = () => finish(new Error('Bund preparation returned an unreadable result.'))
    try {
      worker.postMessage({ project, nodeId })
    } catch (reason) {
      finish(reason instanceof Error ? reason : new Error(String(reason)))
    }
  })
}
