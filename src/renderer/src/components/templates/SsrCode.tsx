import { useEffect, useState } from 'react'
import { fetchSsrItems } from '../../lib/masterData'

interface Props {
  code: string
  description?: string | null
  className?: string
  strong?: boolean
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
  strong = true
}: Props): JSX.Element {
  const [resolvedDescription, setResolvedDescription] = useState(description?.trim() ?? '')

  useEffect(() => {
    const supplied = description?.trim() ?? ''
    setResolvedDescription(supplied)
    if (supplied || !/^IRR-[A-Z]+-/i.test(code)) return

    let cancelled = false
    const category = code.split('-').slice(0, 2).join('-').toUpperCase()
    void fetchSsrItems(category).then((items) => {
      if (cancelled) return
      const item = items.find((candidate) => candidate.code === code)
      if (item) setResolvedDescription(item.description)
    })
    return () => {
      cancelled = true
    }
  }, [code, description])

  const title = resolvedDescription
    ? `${code}\n${resolvedDescription}`
    : `${code}\nFull description is not loaded yet.`
  const classes = `ssr-code-hover${className ? ` ${className}` : ''}`

  return strong ? (
    <b className={classes} title={title}>
      {code}
    </b>
  ) : (
    <span className={classes} title={title}>
      {code}
    </span>
  )
}
