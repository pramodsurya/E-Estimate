import type { BundData, ProjectNode } from '../../types/project'
import BundDashboard from './BundDashboard'

/**
 * Dedicated entry point for a zoned new or repair bund.
 *
 * It deliberately shares the proven survey, casing, seating and optional-work
 * modules with the homogeneous template while switching on casing/hearting
 * quantities and hiding the homogeneous phreatic-line presentation.
 */
export default function ZonedBundRepairDashboard({
  node,
  data,
  onEditSetup
}: {
  node: ProjectNode
  data: BundData
  onEditSetup: (step: 1 | 2) => void
}): JSX.Element {
  return (
    <BundDashboard
      node={node}
      data={data}
      onEditSetup={onEditSetup}
      template="zoned"
    />
  )
}
