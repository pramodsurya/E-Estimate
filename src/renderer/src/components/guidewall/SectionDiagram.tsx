import { useMemo } from 'react'
import type { GuideWallSection } from '../../types/project'
import { hasLeftWall, hasRightWall, wallBottomWidth } from '../../lib/guideWall'

const f2 = (n: number): string => n.toFixed(2)

const WIDTH = 460
const HEIGHT = 264
const PAD = 46

interface WallShape {
  path: string
  topX0: number
  topX1: number
  outerX: number
  innerX: number
}

/**
 * To-scale cross-section of one section: the rectangular base slab with one or
 * two walls on it (vertical inner faces, battered outer faces), the clear gap
 * between them, and live dimension annotations.
 */
export default function SectionDiagram({ section }: { section: GuideWallSection }): JSX.Element {
  const view = useMemo(() => {
    const left = hasLeftWall(section) ? section.left : null
    const right = hasRightWall(section) ? section.right : null
    const bottomL = left ? wallBottomWidth(left) : 0
    const bottomR = right ? wallBottomWidth(right) : 0
    const both = Boolean(left && right)

    const occupied = both ? bottomL + section.gap + bottomR : Math.max(bottomL, bottomR)
    const worldW = Math.max(section.baseWidth, occupied) + 1
    const maxWallH = Math.max(left?.height ?? 0, right?.height ?? 0)
    const worldH = maxWallH + section.baseThickness + 0.8

    const scale = Math.min((WIDTH - PAD * 2) / worldW, (HEIGHT - PAD * 2) / worldH)
    const cx = WIDTH / 2
    const baseTop = HEIGHT - PAD - Math.max(section.baseThickness * scale, 3)
    const baseH = Math.max(section.baseThickness * scale, 3)

    // Inner (vertical) faces. Two walls sit `gap` apart centred on the sheet;
    // a single wall is centred on the base.
    const gapPx = section.gap * scale
    const innerLeftX = both ? cx - gapPx / 2 : cx + (bottomL * scale) / 2
    const innerRightX = both ? cx + gapPx / 2 : cx - (bottomR * scale) / 2

    const makeLeftWall = (): WallShape | null => {
      if (!left) return null
      const topW = Math.max(left.topWidth * scale, 2)
      const botW = Math.max(bottomL * scale, 2)
      const h = left.height * scale
      const inner = innerLeftX
      return {
        path: [
          `M ${inner} ${baseTop}`,
          `L ${inner} ${baseTop - h}`,
          `L ${inner - topW} ${baseTop - h}`,
          `L ${inner - botW} ${baseTop}`,
          'Z'
        ].join(' '),
        topX0: inner - topW,
        topX1: inner,
        outerX: inner - botW,
        innerX: inner
      }
    }

    const makeRightWall = (): WallShape | null => {
      if (!right) return null
      const topW = Math.max(right.topWidth * scale, 2)
      const botW = Math.max(bottomR * scale, 2)
      const h = right.height * scale
      const inner = innerRightX
      return {
        path: [
          `M ${inner} ${baseTop}`,
          `L ${inner} ${baseTop - h}`,
          `L ${inner + topW} ${baseTop - h}`,
          `L ${inner + botW} ${baseTop}`,
          'Z'
        ].join(' '),
        topX0: inner,
        topX1: inner + topW,
        outerX: inner + botW,
        innerX: inner
      }
    }

    return {
      scale,
      baseTop,
      baseH,
      base: { x: cx - (section.baseWidth * scale) / 2, w: section.baseWidth * scale },
      leftWall: makeLeftWall(),
      rightWall: makeRightWall(),
      leftTopY: left ? baseTop - left.height * scale : baseTop,
      rightTopY: right ? baseTop - right.height * scale : baseTop,
      both,
      left,
      right
    }
  }, [section])

  const bottomY = view.baseTop + view.baseH

  return (
    <svg
      className="gw-diagram"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Guide wall cross-section"
    >
      <rect
        x={view.base.x}
        y={view.baseTop}
        width={view.base.w}
        height={view.baseH}
        className="gw-diagram-base"
      />
      {view.leftWall && <path d={view.leftWall.path} className="gw-diagram-wall" />}
      {view.rightWall && <path d={view.rightWall.path} className="gw-diagram-wall" />}

      <g className="gw-diagram-dims">
        {view.leftWall && view.left && (
          <>
            <line
              x1={view.leftWall.topX0}
              y1={view.leftTopY - 10}
              x2={view.leftWall.topX1}
              y2={view.leftTopY - 10}
            />
            <text
              x={(view.leftWall.topX0 + view.leftWall.topX1) / 2}
              y={view.leftTopY - 15}
              textAnchor="middle"
            >
              {f2(view.left.topWidth)}
            </text>
            <text
              x={view.leftWall.outerX - 8}
              y={(view.leftTopY + view.baseTop) / 2}
              textAnchor="end"
            >
              1:{f2(view.left.faceSlope)}
            </text>
            <text
              x={view.leftWall.innerX + (view.both ? 6 : 10)}
              y={(view.leftTopY + view.baseTop) / 2}
              textAnchor="start"
            >
              H {f2(view.left.height)}
            </text>
          </>
        )}

        {view.rightWall && view.right && (
          <>
            <line
              x1={view.rightWall.topX0}
              y1={view.rightTopY - 10}
              x2={view.rightWall.topX1}
              y2={view.rightTopY - 10}
            />
            <text
              x={(view.rightWall.topX0 + view.rightWall.topX1) / 2}
              y={view.rightTopY - 15}
              textAnchor="middle"
            >
              {f2(view.right.topWidth)}
            </text>
            <text
              x={view.rightWall.outerX + 8}
              y={(view.rightTopY + view.baseTop) / 2}
              textAnchor="start"
            >
              1:{f2(view.right.faceSlope)}
            </text>
            {!view.both && (
              <text
                x={view.rightWall.innerX - 10}
                y={(view.rightTopY + view.baseTop) / 2}
                textAnchor="end"
              >
                H {f2(view.right.height)}
              </text>
            )}
          </>
        )}

        {view.both && view.leftWall && view.rightWall && (
          <>
            <line
              x1={view.leftWall.innerX}
              y1={view.baseTop - 12}
              x2={view.rightWall.innerX}
              y2={view.baseTop - 12}
            />
            <text
              x={(view.leftWall.innerX + view.rightWall.innerX) / 2}
              y={view.baseTop - 17}
              textAnchor="middle"
            >
              gap {f2(section.gap)}
            </text>
          </>
        )}

        <line x1={view.base.x} y1={bottomY + 12} x2={view.base.x + view.base.w} y2={bottomY + 12} />
        <text x={WIDTH / 2} y={bottomY + 26} textAnchor="middle">
          base {f2(section.baseWidth)} × {f2(section.baseThickness)}
        </text>
      </g>
    </svg>
  )
}
