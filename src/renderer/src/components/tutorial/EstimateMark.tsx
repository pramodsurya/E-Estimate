/**
 * The E-Estimate mark.
 *
 * Drawn as an engineering instrument rather than an abstract shape: two
 * staff verticals of unequal height sighted across a level line, with the
 * datum tick under it. It reads as a levelling staff pair at small sizes and
 * as a drafted "M" — for measurement — at large ones.
 */
export default function EstimateMark({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="E-Estimate"
      className="ee-mark"
    >
      {/* sight line across the two staves */}
      <path
        d="M5 7 L11.5 20 L16 12.5 L20.5 20 L27 7"
        stroke="var(--component)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* the staves themselves */}
      <path d="M5 7 V24" stroke="var(--title)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M27 7 V24" stroke="var(--title)" strokeWidth="2.2" strokeLinecap="round" />
      {/* datum */}
      <path d="M3 27 H29" stroke="var(--title)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}
