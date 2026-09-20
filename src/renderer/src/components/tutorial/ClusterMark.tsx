/**
 * The Cluster Project mark.
 *
 * Three survey stations triangulated: three nodes joined into one closed
 * traverse. It reads as a linked group at small sizes — a wrapper around
 * projects — and stays visually distinct from the E-Estimate levelling-staff
 * mark (Project) and the single-component glyph (Component).
 */
export default function ClusterMark({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Cluster Project"
      className="ee-cluster-mark"
    >
      {/* traverse legs joining the three stations */}
      <path
        d="M16 6 L27 24 L5 24 Z"
        stroke="var(--cluster, #d7a21b)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* the three stations */}
      <circle cx="16" cy="6" r="3.2" fill="var(--cluster, #d7a21b)" />
      <circle cx="27" cy="24" r="3.2" fill="var(--cluster, #d7a21b)" />
      <circle cx="5" cy="24" r="3.2" fill="var(--cluster, #d7a21b)" />
    </svg>
  )
}
