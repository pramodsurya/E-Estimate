import { useEffect, useState, type ReactNode } from 'react'
import { fetchSsrItems } from '../../lib/masterData'

const ssrDescCache = new Map<string, string>()

function normalizeSsrCode(rawCode: string): { fullCode: string; category: string } {
  const trimmed = rawCode.trim()
  const fullCode = /^IRR-/i.test(trimmed) ? trimmed : `IRR-${trimmed}`
  const category = fullCode.split('-').slice(0, 2).join('-').toUpperCase()
  return { fullCode, category }
}

export function useSsrDescription(
  code?: string | null,
  suppliedDescription?: string | null
): { description: string; title: string } {
  const supplied = suppliedDescription?.trim() ?? ''
  const trimmedCode = code?.trim() ?? ''
  const cached = trimmedCode
    ? (ssrDescCache.get(trimmedCode) ?? ssrDescCache.get(normalizeSsrCode(trimmedCode).fullCode))
    : undefined
  const [desc, setDesc] = useState<string>(supplied || cached || '')

  useEffect(() => {
    if (!trimmedCode) {
      setDesc('')
      return
    }
    const currentSupplied = suppliedDescription?.trim() ?? ''
    if (currentSupplied) {
      setDesc(currentSupplied)
      ssrDescCache.set(trimmedCode, currentSupplied)
      return
    }
    const { fullCode, category } = normalizeSsrCode(trimmedCode)
    const existing = ssrDescCache.get(trimmedCode) ?? ssrDescCache.get(fullCode)
    if (existing) {
      setDesc(existing)
      return
    }

    let cancelled = false
    void fetchSsrItems(category).then((items) => {
      if (cancelled) return
      const item = items.find(
        (candidate) =>
          candidate.code.toUpperCase() === fullCode.toUpperCase() ||
          candidate.code.toUpperCase() === trimmedCode.toUpperCase()
      )
      if (item && item.description) {
        ssrDescCache.set(trimmedCode, item.description)
        ssrDescCache.set(fullCode, item.description)
        setDesc(item.description)
      }
    })

    return () => {
      cancelled = true
    }
  }, [trimmedCode, suppliedDescription])

  const title = desc
    ? `${trimmedCode}\n${desc}`
    : (trimmedCode ? `${trimmedCode}\nFull description is not loaded yet.` : '')

  return { description: desc, title }
}

interface Props {
  code: string
  description?: string | null
  className?: string
  strong?: boolean
  children?: ReactNode
}

/**
 * An SSR/SOR code with its complete master description available on hover.
 * Native title tooltips are intentionally used so they are not clipped by
 * scrollable pickers, cards, tables, or modal boundaries.
 */
export default function SsrCode({
  code,
  description,
  className = '',
  strong = true,
  children
}: Props): JSX.Element {
  const { title } = useSsrDescription(code, description)
  const classes = `ssr-code-hover${className ? ` ${className}` : ''}`
  const content = children ?? code

  return strong ? (
    <b className={classes} title={title}>
      {content}
    </b>
  ) : (
    <span className={classes} title={title}>
      {content}
    </span>
  )
}
