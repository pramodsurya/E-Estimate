import type { CanalPoint } from '../types/project'

type Polygon = CanalPoint[]
const EPS = 1e-8
export function inCorePolygons(polygons: Polygon[], x: number, y: number): boolean {
  return polygons.some((polygon) => {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j]
      if ((a.rl > y) !== (b.rl > y) && x < (b.offset - a.offset) * (y - a.rl) / (b.rl - a.rl) + a.offset) inside = !inside
    }
    return inside
  })
}

/** Partition polygon intersections into disjoint trapezoids, preserving every boundary. */
export function coreCells(polygons: Polygon[], keep: (x: number, y: number) => boolean): Polygon[] {
  const edges = polygons.flatMap((p) => p.map((a, i) => [a, p[(i + 1) % p.length]] as const))
  const xs = polygons.flatMap((p) => p.map((v) => v.offset))
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const [a, b] = edges[i], [c, d] = edges[j]
    const ux = b.offset - a.offset, uy = b.rl - a.rl, vx = d.offset - c.offset, vy = d.rl - c.rl
    const det = ux * vy - uy * vx
    if (Math.abs(det) < EPS) continue
    const t = ((c.offset - a.offset) * vy - (c.rl - a.rl) * vx) / det
    const u = ((c.offset - a.offset) * uy - (c.rl - a.rl) * ux) / det
    if (t > 0 && t < 1 && u > 0 && u < 1) xs.push(a.offset + t * ux)
  }
  const sorted = [...new Set(xs)].sort((a, b) => a - b)
  const cells: Polygon[] = []
  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1], hi = sorted[i], x = (lo + hi) / 2
    if (hi - lo < EPS) continue
    const level = ([a, b]: typeof edges[number], at: number): number => a.rl + (b.rl - a.rl) * (at - a.offset) / (b.offset - a.offset)
    const active = edges.filter(([a, b]) => x > Math.min(a.offset, b.offset) && x < Math.max(a.offset, b.offset)).sort((a, b) => level(a, x) - level(b, x))
    for (let j = 1; j < active.length; j++) {
      const bottom = active[j - 1], top = active[j]
      const y = (level(bottom, x) + level(top, x)) / 2
      if (level(top, x) - level(bottom, x) < EPS || !keep(x, y)) continue
      cells.push([{ offset: lo, rl: level(bottom, lo) }, { offset: hi, rl: level(bottom, hi) }, { offset: hi, rl: level(top, hi) }, { offset: lo, rl: level(top, lo) }])
    }
  }
  return cells
}
