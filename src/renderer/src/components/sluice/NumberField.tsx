import { useEffect, useRef, useState } from 'react'

/**
 * Labelled decimal entry for the sluice screens. It keeps half-typed text like
 * "1." or ".5" intact while the parent stores only finite values, so the caret
 * never jumps out of a field mid-number.
 */
export default function NumberField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  title
}: {
  label: string
  value: number
  onChange: (value: number) => void
  suffix?: string
  min?: number
  title?: string
}): JSX.Element {
  const [draft, setDraft] = useState(() => String(value))
  const focused = useRef(false)
  const committed = useRef(value)
  committed.current = value

  useEffect(() => {
    if (!focused.current) setDraft(String(value))
  }, [value])

  return (
    <label className="mis-field" title={title}>
      <span>
        {label}
        {suffix ? <em>{suffix}</em> : null}
      </span>
      <input
        className="text-input"
        type="text"
        inputMode="decimal"
        value={draft}
        onFocus={() => {
          focused.current = true
        }}
        onBlur={() => {
          focused.current = false
          const parsed = Number(draft.trim())
          setDraft(String(draft.trim() === '' || !Number.isFinite(parsed) ? committed.current : parsed))
        }}
        onChange={(event) => {
          const raw = event.target.value
          setDraft(raw)
          const parsed = Number(raw)
          if (raw.trim() !== '' && Number.isFinite(parsed) && parsed >= min) onChange(parsed)
        }}
      />
    </label>
  )
}
