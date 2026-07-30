import { Tokenizer } from '@huggingface/tokenizers'
import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

interface SemanticCandidate {
  key: string
  text: string
}

interface SemanticRequest {
  type: 'rerank'
  id: number
  query: string
  candidates: SemanticCandidate[]
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<SemanticRequest>) => void) | null
  postMessage: (message: unknown) => void
}

interface EncodedBatch {
  embeddings: Float32Array
  masks: number[]
  sequenceLength: number
}

const scope = globalThis as unknown as WorkerScope
const MODEL_REVISION = '21996dcf231e0b406c3342b374155e43d4960341'
const MODEL_ROOT =
  `https://huggingface.co/mixedbread-ai/mxbai-edge-colbert-v0-17m/resolve/${MODEL_REVISION}/`
const MODEL_SHA256 = '1d4a2876f8c325f43b97d186e22f6b63ebe9820827d73b81fcea180c20e5518b'
const CACHE_NAME = `eestimate-mxbai-edge-colbert-${MODEL_REVISION.slice(0, 12)}`
const QUERY_LENGTH = 48
const DOCUMENT_LENGTH = 256
const EMBEDDING_DIMENSION = 48
const MASK_TOKEN_ID = 50284
const MASKED_TOKENS = new Set(['[CLS]', '[SEP]', '[MASK]', '[Q] ', '[D] '])
const SKIPLIST = new Set([
  '!',
  '"',
  '#',
  '$',
  '%',
  '&',
  "'",
  '(',
  ')',
  '*',
  '+',
  ',',
  '-',
  '.',
  '/',
  ':',
  ';',
  '<',
  '=',
  '>',
  '?',
  '@',
  '[',
  '\\',
  ']',
  '^',
  '_',
  '`',
  '{',
  '|',
  '}',
  '~'
])

ort.env.wasm.numThreads = 1
ort.env.wasm.proxy = false
ort.env.wasm.wasmPaths = { wasm: wasmUrl }

let runtimePromise: Promise<{
  tokenizer: Tokenizer
  session: ort.InferenceSession
}> | null = null

function sendProgress(id: number, message: string): void {
  scope.postMessage({ type: 'progress', id, message })
}

async function cachedFetch(url: string): Promise<Response> {
  try {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(url)
    if (cached) return cached
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Search model download failed (${response.status}).`)
    await cache.put(url, response.clone())
    return response
  } catch (error) {
    if (error instanceof Error && /download failed/.test(error.message)) throw error
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Search model download failed (${response.status}).`)
    return response
  }
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

async function loadRuntime(requestId: number): Promise<{
  tokenizer: Tokenizer
  session: ort.InferenceSession
}> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      sendProgress(requestId, 'Preparing AI relevance model · one-time 21 MB download')
      const [modelResponse, tokenizerResponse, tokenizerConfigResponse] = await Promise.all([
        cachedFetch(`${MODEL_ROOT}model_int8.onnx`),
        cachedFetch(`${MODEL_ROOT}tokenizer.json`),
        cachedFetch(`${MODEL_ROOT}tokenizer_config.json`)
      ])
      const [modelBuffer, tokenizerJson, tokenizerConfig] = await Promise.all([
        modelResponse.arrayBuffer(),
        tokenizerResponse.json() as Promise<object>,
        tokenizerConfigResponse.json() as Promise<object>
      ])

      if ((await sha256(modelBuffer)) !== MODEL_SHA256) {
        throw new Error('The downloaded semantic-search model failed its integrity check.')
      }

      sendProgress(requestId, 'Starting AI relevance model')
      const [session] = await Promise.all([
        ort.InferenceSession.create(modelBuffer, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all'
        })
      ])
      return {
        tokenizer: new Tokenizer(tokenizerJson, tokenizerConfig),
        session
      }
    })().catch((error) => {
      runtimePromise = null
      throw error
    })
  }
  return runtimePromise
}

function paddedEncoding(
  tokenizer: Tokenizer,
  text: string,
  prefix: '[Q] ' | '[D] ',
  sequenceLength: number
): { ids: number[]; mask: number[] } {
  const encoded = tokenizer.encode(`${prefix}${text.toLocaleLowerCase()}`)
  const ids = encoded.ids.slice(0, sequenceLength)
  const mask = encoded.attention_mask.slice(0, sequenceLength)
  const tokens = encoded.tokens.slice(0, sequenceLength)

  for (let index = 0; index < mask.length; index += 1) {
    const token = tokens[index]
    if (MASKED_TOKENS.has(token) || SKIPLIST.has(token)) mask[index] = 0
  }
  while (ids.length < sequenceLength) {
    ids.push(MASK_TOKEN_ID)
    mask.push(0)
  }
  return { ids, mask }
}

async function encodeBatch(
  runtime: { tokenizer: Tokenizer; session: ort.InferenceSession },
  texts: string[],
  prefix: '[Q] ' | '[D] ',
  sequenceLength: number
): Promise<EncodedBatch> {
  const ids: number[] = []
  const masks: number[] = []
  for (const text of texts) {
    const encoded = paddedEncoding(runtime.tokenizer, text, prefix, sequenceLength)
    ids.push(...encoded.ids)
    masks.push(...encoded.mask)
  }

  const output = await runtime.session.run({
    input_ids: new ort.Tensor(
      'int64',
      BigInt64Array.from(ids, (value) => BigInt(value)),
      [texts.length, sequenceLength]
    ),
    attention_mask: new ort.Tensor(
      'int64',
      BigInt64Array.from(masks, (value) => BigInt(value)),
      [texts.length, sequenceLength]
    )
  })
  const tensor = output[runtime.session.outputNames[0]]
  return {
    embeddings: tensor.data as Float32Array,
    masks,
    sequenceLength
  }
}

function maxSim(
  query: EncodedBatch,
  documents: EncodedBatch,
  documentIndex: number
): number {
  let total = 0
  for (let queryToken = 0; queryToken < query.sequenceLength; queryToken += 1) {
    if (!query.masks[queryToken]) continue
    let best = Number.NEGATIVE_INFINITY
    for (
      let documentToken = 0;
      documentToken < documents.sequenceLength;
      documentToken += 1
    ) {
      const documentMaskIndex =
        documentIndex * documents.sequenceLength + documentToken
      if (!documents.masks[documentMaskIndex]) continue
      let similarity = 0
      const queryOffset = queryToken * EMBEDDING_DIMENSION
      const documentOffset = documentMaskIndex * EMBEDDING_DIMENSION
      for (let dimension = 0; dimension < EMBEDDING_DIMENSION; dimension += 1) {
        similarity +=
          query.embeddings[queryOffset + dimension] *
          documents.embeddings[documentOffset + dimension]
      }
      if (similarity > best) best = similarity
    }
    if (Number.isFinite(best)) total += best
  }
  return total
}

async function rerank(request: SemanticRequest): Promise<void> {
  if (request.candidates.length === 0) {
    scope.postMessage({ type: 'result', id: request.id, scores: {} })
    return
  }
  const runtime = await loadRuntime(request.id)
  sendProgress(request.id, 'Understanding description relevance')
  const [query, documents] = await Promise.all([
    encodeBatch(runtime, [request.query], '[Q] ', QUERY_LENGTH),
    encodeBatch(
      runtime,
      request.candidates.map((candidate) => candidate.text),
      '[D] ',
      DOCUMENT_LENGTH
    )
  ])
  const scores: Record<string, number> = {}
  request.candidates.forEach((candidate, index) => {
    scores[candidate.key] = maxSim(query, documents, index)
  })
  scope.postMessage({ type: 'result', id: request.id, scores })
}

scope.onmessage = (event): void => {
  const request = event.data
  if (request.type !== 'rerank') return
  void rerank(request).catch((error) => {
    scope.postMessage({
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : String(error)
    })
  })
}

