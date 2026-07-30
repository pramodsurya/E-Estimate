import type { MasterItem } from './masterData'

export interface ParsedMasterSearch {
  raw: string
  normalized: string
  tokens: string[]
  exactConstraints: string[]
  intentTokens: string[]
  compactCodeQuery: string | null
}

export interface MasterSearchMatch {
  item: MasterItem
  key: string
  lexicalScore: number
  semanticScore?: number
  finalScore: number
  reasons: string[]
}

const STOP_WORDS = new Set([
  'a',
  'all',
  'and',
  'as',
  'at',
  'by',
  'cement',
  'complete',
  'concrete',
  'for',
  'from',
  'grade',
  'in',
  'including',
  'item',
  'items',
  'laying',
  'of',
  'on',
  'or',
  'providing',
  'rate',
  'the',
  'to',
  'using',
  'with',
  'work',
  'works'
])

const CONCEPT_GROUPS = [
  ['foundation', 'foundations', 'footing', 'footings'],
  ['hume', 'rccpipe', 'reinforcedcementconcretepipe'],
  ['plainend', 'plainended', 'plain'],
  ['socket', 'spigot', 'socketandspigot'],
  ['transport', 'transportation', 'carriage'],
  ['canal', 'channel', 'lining'],
  ['pier', 'piers', 'abutment', 'abutments'],
  ['labour', 'labor'],
  ['excavation', 'excavating', 'earthwork'],
  ['centering', 'shuttering', 'formwork'],
  ['aggregate', 'aggregates', 'metal']
] as const

const EXACT_CONSTRAINT = /^(?:m\d{1,3}|np\d{1,2}|\d+(?:\.\d+)?(?:mm|cm|kg|sqm|cum|rm|nos))$/

function stemToken(value: string): string {
  if (value.length > 5 && value.endsWith('ies')) return `${value.slice(0, -3)}y`
  if (value.length > 4 && value.endsWith('s') && !value.endsWith('ss')) return value.slice(0, -1)
  return value
}

export function normalizeMasterSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/\b(m|np)\s*[-–—]?\s*(\d{1,3})\b/gi, '$1$2')
    .replace(
      /\b(\d+(?:\.\d+)?)\s*(millimetres?|millimeters?|mm|centimetres?|centimeters?|cm|kilograms?|kg|square\s*metres?|sqm|cubic\s*metres?|cum|running\s*metres?|rm|numbers?|nos)\b/gi,
      (_match, amount: string, unit: string) => {
        const compactUnit = unit.replace(/\s+/g, '')
        if (/^milli/.test(compactUnit)) return `${amount}mm`
        if (/^centi/.test(compactUnit)) return `${amount}cm`
        if (/^kilo/.test(compactUnit)) return `${amount}kg`
        if (/^square/.test(compactUnit)) return `${amount}sqm`
        if (/^cubic/.test(compactUnit)) return `${amount}cum`
        if (/^running/.test(compactUnit)) return `${amount}rm`
        if (/^(number|numbers)/.test(compactUnit)) return `${amount}nos`
        return `${amount}${compactUnit}`
      }
    )
    .replace(/\brcc\s+(?:hume\s+)?pipe\b/g, 'rccpipe')
    .replace(/\breinforced\s+cement\s+concrete\s+pipe\b/g, 'reinforcedcementconcretepipe')
    .replace(/\bplain\s*[-–—]?\s*ended?\b/g, 'plainend')
    .replace(/\bsocket\s*[-–—]?\s*and\s*[-–—]?\s*spigot\b/g, 'socketandspigot')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizedTokens(value: string): string[] {
  if (!value) return []
  return value
    .split(' ')
    .map(stemToken)
    .filter(Boolean)
}

export function masterSearchItemKey(item: MasterItem): string {
  return `${item.side}:${item.category}:${item.code}`
}

export function parseMasterSearch(raw: string): ParsedMasterSearch {
  const normalized = normalizeMasterSearchText(raw)
  const tokens = Array.from(new Set(normalizedTokens(normalized)))
  const exactConstraints = tokens.filter((token) => EXACT_CONSTRAINT.test(token))
  const intentTokens = tokens.filter(
    (token) => !EXACT_CONSTRAINT.test(token) && !STOP_WORDS.has(token)
  )
  const compact = raw.toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
  const compactCodeQuery = /(?:irr|ssr|sor)[-\s/]?/i.test(raw) && compact.length >= 5 ? compact : null
  return { raw, normalized, tokens, exactConstraints, intentTokens, compactCodeQuery }
}

function conceptAlternatives(token: string): string[] {
  const stemmed = stemToken(token)
  const group = CONCEPT_GROUPS.find((values) =>
    values.some((value) => stemToken(value) === stemmed)
  )
  return group ? Array.from(new Set(group.map(stemToken))) : [stemmed]
}

function bigrams(value: string): Set<string> {
  const out = new Set<string>()
  for (let index = 0; index < value.length - 1; index += 1) {
    out.add(value.slice(index, index + 2))
  }
  return out
}

function diceSimilarity(left: string, right: string): number {
  if (left === right) return 1
  if (left.length < 4 || right.length < 4) return 0
  const a = bigrams(left)
  const b = bigrams(right)
  let shared = 0
  for (const value of a) if (b.has(value)) shared += 1
  return (2 * shared) / (a.size + b.size)
}

function bestFuzzyToken(queryToken: string, documentTokens: string[]): string | null {
  if (queryToken.length < 5) return null
  let best: string | null = null
  let score = 0
  for (const token of documentTokens) {
    const next = diceSimilarity(queryToken, token)
    if (next > score) {
      best = token
      score = next
    }
  }
  return score >= 0.78 ? best : null
}

function displayConstraint(value: string): string {
  if (/^m\d+$/i.test(value)) return `${value.toUpperCase()} exact`
  if (/^np\d+$/i.test(value)) return `${value.toUpperCase()} exact`
  const measurement = value.match(/^(\d+(?:\.\d+)?)(mm|cm|kg|sqm|cum|rm|nos)$/)
  if (!measurement) return `${value.toUpperCase()} exact`
  const labels: Record<string, string> = {
    mm: 'mm',
    cm: 'cm',
    kg: 'kg',
    sqm: 'sqm',
    cum: 'cum',
    rm: 'Rm',
    nos: 'Nos'
  }
  return `${measurement[1]} ${labels[measurement[2]]} exact`
}

function phraseFromDescription(description: string, matchedToken: string): string {
  const plain = description.replace(/\s+/g, ' ').trim()
  const specialPatterns: Record<string, RegExp> = {
    rccpipe: /\brcc\s+(?:hume\s+)?pipe\b/i,
    reinforcedcementconcretepipe: /\breinforced\s+cement\s+concrete\s+pipe\b/i,
    plainend: /\bplain\s*[-–—]?\s*ended?\b/i,
    socketandspigot: /\bsocket\s*[-–—]?\s*and\s*[-–—]?\s*spigot\b/i
  }
  const escaped = matchedToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matcher = specialPatterns[matchedToken] ?? new RegExp(`\\b${escaped}(?:s|es)?\\b`, 'i')
  const match = matcher.exec(plain)
  if (!match || match.index === undefined) return matchedToken
  const words = plain.slice(match.index).match(/[A-Za-z0-9/-]+/g) ?? []
  return words.slice(0, 2).join(' ') || matchedToken
}

function matchItem(item: MasterItem, parsed: ParsedMasterSearch): MasterSearchMatch | null {
  const key = masterSearchItemKey(item)
  const description = normalizeMasterSearchText(item.description)
  const code = normalizeMasterSearchText(item.code)
  const document = `${code} ${description} ${normalizeMasterSearchText(item.unit ?? '')}`.trim()
  const documentTokens = normalizedTokens(document)
  const documentTokenSet = new Set(documentTokens)
  const compactCode = item.code.toLocaleLowerCase().replace(/[^a-z0-9]/g, '')

  for (const constraint of parsed.exactConstraints) {
    if (!documentTokenSet.has(constraint) && !document.includes(constraint)) return null
  }

  let score = 0
  const reasons: string[] = []
  let codeMatched = false

  if (parsed.compactCodeQuery) {
    if (compactCode === parsed.compactCodeQuery) {
      score += 220
      codeMatched = true
      reasons.push('Item code exact')
    } else if (compactCode.includes(parsed.compactCodeQuery)) {
      score += 90
      codeMatched = true
      reasons.push('Item code match')
    }
  }

  for (const constraint of parsed.exactConstraints) {
    score += 50
    reasons.push(displayConstraint(constraint))
  }

  if (parsed.normalized && document.includes(parsed.normalized)) score += 35

  let matchedIntent = 0
  const matchedPhrases: string[] = []
  for (const intent of parsed.intentTokens) {
    const alternatives = conceptAlternatives(intent)
    const exact = alternatives.find((candidate) => documentTokenSet.has(candidate))
    if (exact) {
      score += exact === intent ? 18 : 12
      matchedIntent += 1
      matchedPhrases.push(phraseFromDescription(item.description, exact))
      continue
    }

    const fuzzy = bestFuzzyToken(intent, documentTokens)
    if (fuzzy) {
      score += 7
      matchedIntent += 1
      matchedPhrases.push(phraseFromDescription(item.description, fuzzy))
    }
  }

  if (parsed.intentTokens.length > 0) {
    score += (matchedIntent / parsed.intentTokens.length) * 10
  }

  if (!codeMatched && parsed.intentTokens.length > 0 && matchedIntent === 0) {
    return null
  }

  if (!codeMatched && parsed.tokens.length > 0 && score === 0) return null

  for (const phrase of Array.from(new Set(matchedPhrases)).slice(0, 2)) {
    reasons.push(`Description: ${phrase}`)
  }

  return {
    item,
    key,
    lexicalScore: score,
    finalScore: score,
    reasons: Array.from(new Set(reasons)).slice(0, 3)
  }
}

export function rankMasterItems(
  items: MasterItem[],
  query: string | ParsedMasterSearch
): MasterSearchMatch[] {
  const parsed = typeof query === 'string' ? parseMasterSearch(query) : query
  if (!parsed.normalized) {
    return items.map((item) => ({
      item,
      key: masterSearchItemKey(item),
      lexicalScore: 0,
      finalScore: 0,
      reasons: []
    }))
  }

  return items
    .map((item) => matchItem(item, parsed))
    .filter((match): match is MasterSearchMatch => match !== null)
    .sort(
      (left, right) =>
        right.finalScore - left.finalScore ||
        left.item.description.localeCompare(right.item.description)
    )
}

export function shouldUseSemanticSearch(parsed: ParsedMasterSearch): boolean {
  return parsed.normalized.length >= 4 && parsed.intentTokens.length > 0
}

export function applySemanticScores(
  matches: MasterSearchMatch[],
  semanticScores: Record<string, number>
): MasterSearchMatch[] {
  const scored = matches
    .filter((match) => Number.isFinite(semanticScores[match.key]))
    .sort((left, right) => semanticScores[right.key] - semanticScores[left.key])
  const rank = new Map(scored.map((match, index) => [match.key, index]))
  const denominator = Math.max(1, scored.length - 1)

  return matches
    .map((match) => {
      const semanticScore = semanticScores[match.key]
      const position = rank.get(match.key)
      if (!Number.isFinite(semanticScore) || position === undefined) return match
      const semanticBoost = 14 * (1 - position / denominator)
      return {
        ...match,
        semanticScore,
        finalScore: match.lexicalScore + semanticBoost
      }
    })
    .sort(
      (left, right) =>
        right.finalScore - left.finalScore ||
        left.item.description.localeCompare(right.item.description)
    )
}
