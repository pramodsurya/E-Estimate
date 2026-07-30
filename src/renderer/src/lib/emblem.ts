/**
 * The Government of Telangana emblem, as something printable.
 *
 * A dev server resolves `?inline` to an asset path rather than to the bytes, so
 * covers written during development stored that path — and it resolves nowhere
 * in a packaged build, nor inside the print renderer, which loads its page from
 * a temp file. Reading it back through the asset URL once gives one embedded
 * emblem that prints the same either way.
 */

import emblemTelanganaPng from '../assets/emblem-telangana.png?inline'
// `?inline` is a transform, so a dev server answers a request for it with the
// JavaScript module rather than the image. `?url` is the servable address of
// the file itself, in development and in a build alike — fetch that.
import emblemTelanganaUrl from '../assets/emblem-telangana.png?url'

let inlined = emblemTelanganaPng.startsWith('data:') ? emblemTelanganaPng : ''

/** True when these bytes really are a PNG, whatever the server called them. */
function looksLikePng(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
}

/** Resolve the emblem to a data URL. Safe to call repeatedly; caches. */
export async function ensureEmblemInlined(): Promise<void> {
  if (inlined) return
  // Both candidates are tried: which one is the file and which one is a
  // transform depends on whether this is a dev server or a build.
  const candidates = Array.from(new Set([emblemTelanganaUrl, emblemTelanganaPng]))
  for (const candidate of candidates) {
    if (candidate.startsWith('data:')) {
      inlined = candidate
      console.info('[emblem] using the bundled data URL')
      return
    }
    try {
      const response = await fetch(candidate)
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (!looksLikePng(bytes)) {
        // A dev server answers a transform path with JavaScript and a 200;
        // embedding that would print as a broken image just as surely.
        console.warn(
          `[emblem] ${candidate} returned ${response.status} ${
            response.headers.get('content-type') ?? 'no content-type'
          }, ${bytes.length} bytes — not a PNG`
        )
        continue
      }
      let binary = ''
      for (let index = 0; index < bytes.length; index += 1) {
        binary += String.fromCharCode(bytes[index])
      }
      inlined = `data:image/png;base64,${btoa(binary)}`
      console.info(`[emblem] embedded ${Math.round(bytes.length / 1024)}KB from ${candidate}`)
      return
    } catch (reason: unknown) {
      console.warn(`[emblem] ${candidate} could not be read`, reason)
    }
  }
  console.warn('[emblem] not embedded; it will not appear on printed pages')
}

/** The embedded emblem when it is available, otherwise the asset URL. */
export function emblemSource(): string {
  return inlined || emblemTelanganaPng
}

/** True when `source` points at the emblem that ships with the app. */
export function isEmblemSource(source: string): boolean {
  return /emblem-telangana\.(png|svg)/.test(source)
}
