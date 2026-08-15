import { useMemo } from 'react'
import type { MiSluiceNewData } from '../../types/project'
import { miSluiceSectionSvg } from '../../lib/miSluiceFigure'

/**
 * The live section through the sluice. The drawing itself is built by
 * `miSluiceSectionSvg` so the screen and the printed detailed estimate can
 * never drift apart; the markup is generated purely from the numbers in
 * `data`, which is why it is safe to inject here.
 */
export default function MiSluiceSectionDiagram({ data }: { data: MiSluiceNewData }): JSX.Element {
  const svg = useMemo(() => miSluiceSectionSvg(data), [data])
  return <div className="mis-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
}
