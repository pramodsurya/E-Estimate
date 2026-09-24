/** Rasterize SVG artwork to a white-backed PNG for native Excel embedding. */
export async function rasterizeSvg(
  svg: string,
  targetWidthPx: number
): Promise<{ dataBase64: string; widthPx: number; heightPx: number } | null> {
  if (!svg) return null
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null
  const fail = (why: string): Error => new Error(`SVG raster failed: ${why}`)
  try {
    const box = /viewBox\s*=\s*"([\d.\-+eE\s]+)"/.exec(svg)
    const attr = (name: string): number | null => {
      const match = new RegExp(`${name}\\s*=\\s*"([\\d.]+)`).exec(svg)
      return match ? Number(match[1]) : null
    }
    let w = attr('width')
    let h = attr('height')
    if ((!w || !h) && box) {
      const parts = box[1].trim().split(/\s+/).map(Number)
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) [w, h] = [parts[2], parts[3]]
    }
    if (!w || !h || w <= 0 || h <= 0) return null
    const widthPx = Math.round(targetWidthPx)
    const heightPx = Math.max(1, Math.round(h * targetWidthPx / w))
    const sized = svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    const tagged = sized
      .replace(/<svg([^>]*)width\s*=\s*"[^"]*"/, '<svg$1width="__W__"')
      .replace(/<svg([^>]*)height\s*=\s*"[^"]*"/, '<svg$1height="__H__"')
    const final = (tagged.includes('__W__') ? tagged : tagged.replace('<svg', '<svg width="__W__" height="__H__"'))
      .replace('__W__', String(widthPx))
      .replace('__H__', String(heightPx))
    const url = URL.createObjectURL(new Blob([final], { type: 'image/svg+xml;charset=utf-8' }))
    try {
      const drawn = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = (): void => resolve(img)
        img.onerror = (): void => reject(fail('undecodable SVG'))
        img.src = url
      })
      const canvas = document.createElement('canvas')
      canvas.width = drawn.naturalWidth || widthPx
      canvas.height = drawn.naturalHeight || heightPx
      const ctx = canvas.getContext('2d')
      if (!ctx) throw fail('no 2d context')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(drawn, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/png')
      const comma = dataUrl.indexOf(',')
      if (comma < 0) throw fail('raster encode failed')
      return { dataBase64: dataUrl.slice(comma + 1), widthPx: canvas.width, heightPx: canvas.height }
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SVG raster failed')) throw error
    throw fail(error instanceof Error ? error.message : String(error))
  }
}
