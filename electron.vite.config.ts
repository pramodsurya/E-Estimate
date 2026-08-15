import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      // The Front Cover snapshot stores the Telangana emblem as a data URL so
      // saved projects stay portable across app upgrades and build hashes. That
      // is arranged where it is needed — `emblem.ts` and `univerDocument.ts`
      // import the PNG with an explicit `?inline`, which Vite honours whatever
      // this limit says. Raising the limit to cover the emblem by size instead
      // inlined *every* asset under 100 KB as base64, at +33% size and all of it
      // parsed into the JS heap at startup; worse, it also caught `emblem.ts`'s
      // deliberate `?url` import, so the servable-address fallback it exists to
      // provide resolved to the same data URL as the inline one. Left at the
      // Vite default, each import means what it says.
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    }
  }
})
