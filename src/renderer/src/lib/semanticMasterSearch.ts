import type { MasterSearchMatch } from './masterSearch'

export interface SemanticSearchProgress {
  status: 'loading' | 'ready' | 'fallback'
  message: string
}

interface PendingRequest {
  resolve: (scores: Record<string, number>) => void
  reject: (error: Error) => void
  onProgress?: (progress: SemanticSearchProgress) => void
  timer: number
}

interface WorkerMessage {
  type: 'progress' | 'result' | 'error'
  id: number
  message?: string
  scores?: Record<string, number>
}

const MAX_SEMANTIC_CANDIDATES = 48
const REQUEST_TIMEOUT_MS = 120_000
let worker: Worker | null = null
let nextRequestId = 1
const pending = new Map<number, PendingRequest>()

function semanticWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./semanticMasterSearch.worker.ts', import.meta.url), {
    type: 'module',
    name: 'eestimate-semantic-search'
  })
  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data
    const request = pending.get(message.id)
    if (!request) return
    if (message.type === 'progress') {
      request.onProgress?.({
        status: 'loading',
        message: message.message ?? 'AI relevance ranking'
      })
      return
    }

    window.clearTimeout(request.timer)
    pending.delete(message.id)
    if (message.type === 'error') {
      request.reject(new Error(message.message ?? 'Semantic search is unavailable.'))
      return
    }
    request.resolve(message.scores ?? {})
  }
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Semantic search worker failed.')
    for (const request of pending.values()) {
      window.clearTimeout(request.timer)
      request.reject(error)
    }
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

export function semanticCandidateMatches(matches: MasterSearchMatch[]): MasterSearchMatch[] {
  return matches.slice(0, MAX_SEMANTIC_CANDIDATES)
}

export function rerankMasterSearch(
  query: string,
  matches: MasterSearchMatch[],
  onProgress?: (progress: SemanticSearchProgress) => void
): Promise<Record<string, number>> {
  const candidates = semanticCandidateMatches(matches)
  if (candidates.length < 2) return Promise.resolve({})
  const id = nextRequestId
  nextRequestId += 1

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(id)
      reject(new Error('Semantic search took too long; description ranking is still available.'))
    }, REQUEST_TIMEOUT_MS)
    pending.set(id, { resolve, reject, onProgress, timer })
    onProgress?.({ status: 'loading', message: 'Preparing AI relevance ranking' })
    semanticWorker().postMessage({
      type: 'rerank',
      id,
      query,
      candidates: candidates.map((match) => ({
        key: match.key,
        text: [
          `Item code: ${match.item.code}`,
          `Description: ${match.item.description}`,
          match.item.unit ? `Unit: ${match.item.unit}` : '',
          `Section: ${match.item.category}`
        ]
          .filter(Boolean)
          .join('\n')
      }))
    })
  })
}
