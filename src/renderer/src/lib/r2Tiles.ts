/**
 * Cloudflare R2 public tile host for the toposheet KMZ pyramid.
 *
 * The bucket serves tiles as plain images (no `Access-Control-Allow-Origin`),
 * so the desktop capture path downloads them through Tauri's native
 * `image.embedRemote` command. Browser/Vite sessions go through the same-origin
 * dev proxy below, which `vite.config.ts` forwards to this host.
 */
export const R2_TILE_HOST = 'pub-1f022f4a6cbd43dab0ae7f7752d325b4.r2.dev'

/** Same-origin prefix proxied to {@link R2_TILE_HOST} by the Vite dev server. */
export const R2_TILES_DEV_PROXY = '/__r2_tiles'

export const R2_TILE_ROOT = `https://${R2_TILE_HOST}/tiles`
