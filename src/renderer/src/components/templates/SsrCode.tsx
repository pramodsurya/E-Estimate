import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { fetchSsrItems } from '../../lib/masterData'
import type { CatalogueGuidance } from '../../lib/catalogueGuidance'
import { CatalogueDetailContent } from './CatalogueItemDetails'

const ssrDescCache = new Map<string, string>()
const ssrGuidanceCache = new Map<string, CatalogueGuidance | undefined>()

function normalizeSsrCode(rawCode: string): { fullCode: string; category: string } {
  const trimmed = rawCode.trim()
  const fullCode = /^IRR-/i.test(trimmed) ? trimmed : `IRR-${trimmed}`
  const category = fullCode.split('-').slice(0, 2).join('-').toUpperCase()
  return { fullCode, category }
}

export function useSsrDescription(
  code?: string | null,
  suppliedDescription?: string | null
): { description: string; title: string; guidance?: CatalogueGuidance } {
  const supplied = suppliedDescription?.trim() ?? ''
  const trimmedCode = code?.trim() ?? ''
  const cached = trimmedCode
    ? (ssrDescCache.get(trimmedCode) ?? ssrDescCache.get(normalizeSsrCode(trimmedCode).fullCode))
    : undefined
  const [desc, setDesc] = useState<string>(supplied || cached || '')
  const [sourceGuidance, setSourceGuidance] = useState(() => ssrGuidanceCache.get(normalizeSsrCode(trimmedCode).fullCode))
  const [prevSync, setPrevSync] = useState(() => ({ trimmedCode, supplied }))
  if (prevSync.trimmedCode !== trimmedCode || prevSync.supplied !== supplied) {
    setPrevSync({ trimmedCode, supplied })
    setDesc(supplied || cached || '')
    setSourceGuidance(ssrGuidanceCache.get(normalizeSsrCode(trimmedCode).fullCode))
  }

  useEffect(() => {
    if (!trimmedCode) return
    const { fullCode, category } = normalizeSsrCode(trimmedCode)
    if (!/^IRR-(TAW|DAW|CAW|GAW|CCDW|PMW)-/i.test(fullCode)) return
    if (ssrGuidanceCache.has(fullCode)) return

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
        ssrGuidanceCache.set(fullCode, item.guidance)
        if (!supplied) setDesc(item.description)
        setSourceGuidance(item.guidance)
      }
    }).catch(() => { /* Keep the supplied description if catalogue loading fails. */ })

    return () => {
      cancelled = true
    }
  }, [trimmedCode, supplied])

  const title = desc
    ? `${trimmedCode}\n${desc}`
    : (trimmedCode ? `${trimmedCode}\nFull description is not loaded yet.` : '')

  return { description: desc, title, guidance: sourceGuidance }
}

interface Props {
  code: string
  description?: string | null
  guidance?: CatalogueGuidance
  className?: string
  strong?: boolean
  children?: ReactNode
}

/**
 * Portalled help stays readable outside scrollable pickers and modal boundaries.
 */
export default function SsrCode({
  code,
  description,
  guidance,
  className = '',
  strong = true,
  children
}: Props): JSX.Element {
  const { description: fullDescription, guidance: sourceGuidance } = useSsrDescription(code, description)
  const effectiveGuidance = guidance ?? sourceGuidance
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: -9999, top: -9999, maxHeight: 540 })
  const anchor = useRef<HTMLElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipId = useId()
  const cancelClose = (): void => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const cancelOpen = (): void => {
    if (openTimer.current) clearTimeout(openTimer.current)
    openTimer.current = null
  }
  const show = (): void => { cancelOpen(); cancelClose(); setOpen(true) }
  const hover = (): void => {
    cancelClose()
    if (!open && !openTimer.current) openTimer.current = setTimeout(show, 300)
  }
  const scheduleClose = (): void => {
    cancelOpen()
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), 180)
  }
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    if (openTimer.current) clearTimeout(openTimer.current)
  }, [])
  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      if (!anchor.current || !card.current) return
      const rect = anchor.current.getBoundingClientRect()
      const gap = 12
      const below = window.innerHeight - rect.bottom - gap * 2
      const above = rect.top - gap * 2
      const useBelow = below >= Math.min(card.current.scrollHeight, 420) || below >= above
      const maxHeight = Math.max(120, Math.min(540, useBelow ? below : above))
      const height = Math.min(card.current.scrollHeight, maxHeight)
      const left = Math.max(gap, Math.min(rect.left, window.innerWidth - card.current.offsetWidth - gap))
      const top = Math.max(gap, useBelow ? rect.bottom + 8 : rect.top - height - 8)
      setPosition({ left, top, maxHeight })
    }
    const escape = (event: KeyboardEvent): void => { if (event.key === 'Escape') setOpen(false) }
    const scroll = (event: Event): void => {
      if (!(event.target instanceof Node) || !card.current?.contains(event.target)) setOpen(false)
    }
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !card.current?.contains(event.target) && !anchor.current?.contains(event.target)) setOpen(false)
    }
    place()
    const cardElement = card.current
    cardElement?.addEventListener('toggle', place, true)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('keydown', escape)
    window.addEventListener('pointerdown', outside, true)
    return () => {
      cardElement?.removeEventListener('toggle', place, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('keydown', escape)
      window.removeEventListener('pointerdown', outside, true)
    }
  }, [open, fullDescription, effectiveGuidance])
  const classes = `ssr-code-hover${className ? ` ${className}` : ''}`
  const content = children ?? code
  const Tag = strong ? 'b' : 'span'
  return <>
    <Tag ref={anchor} className={classes} tabIndex={0} aria-describedby={open ? tooltipId : undefined}
      onMouseMove={hover} onMouseLeave={scheduleClose} onFocus={show}
      onBlur={(event) => {
        cancelOpen()
        if (!card.current?.contains(event.relatedTarget)) setOpen(false)
      }}>
      {content}
    </Tag>
    {open && createPortal(<div id={tooltipId} ref={card} role="tooltip" className="catalogue-hover-card"
      style={position} onMouseEnter={cancelClose} onMouseLeave={scheduleClose} onFocus={cancelClose} onBlur={scheduleClose}>
      <div className="catalogue-hover-code">{code}</div>
      <CatalogueDetailContent item={{ code, description: fullDescription, guidance: effectiveGuidance }} collapsible />
    </div>, document.body)}
  </>
}
