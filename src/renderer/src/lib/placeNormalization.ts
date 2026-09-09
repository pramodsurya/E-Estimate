/**
 * Normalizes a place name (district, mandal, village, or town) into consistent Title Case
 * while properly handling:
 * - Acronyms (e.g., GHMC, HMDA, TSIIC, ORR, HQ, ITDA) preserved in uppercase
 * - Roman numerals (e.g., Phase-I, Sector-II, Ward-IV) preserved in uppercase
 * - Compound hyphenated names (e.g., Medchal-Malkajgiri) with each part capitalized
 * - Parenthesized qualifiers (e.g., Warangal (Urban), Khammam (Rural), Warangal (R))
 * - Slashes (e.g., Hyderabad/Secunderabad)
 * - Extra whitespace trimmed
 */

const KNOWN_UPPERCASE = new Set([
  'GHMC',
  'HMDA',
  'TSIIC',
  'ORR',
  'HQ',
  'ITDA'
])

const ROMAN_NUMERAL_REGEX = /\b(i{1,3}|iv|vi{0,3}|ix|x)\b/gi

export function normalizePlaceName(value?: string | null): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (KNOWN_UPPERCASE.has(trimmed.toUpperCase())) {
    return trimmed.toUpperCase()
  }

  return trimmed
    .toLowerCase()
    .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, boundary, letter) => boundary + letter.toUpperCase())
    .replace(ROMAN_NUMERAL_REGEX, (match) => match.toUpperCase())
    .replace(/\b([a-z]{2,5})\b/gi, (word) => {
      if (KNOWN_UPPERCASE.has(word.toUpperCase())) {
        return word.toUpperCase()
      }
      return word
    })
}

export function normalizePlaceNameOrNull(value?: string | null): string | null {
  const result = normalizePlaceName(value)
  return result ? result : null
}
