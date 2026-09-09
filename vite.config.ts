import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Vite config for the Tauri WebView2 renderer (dev server + production bundle). */
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    dedupe: [
      '@tiptap/core',
      '@tiptap/pm',
      'prosemirror-model',
      'prosemirror-state',
      'prosemirror-transform',
      'prosemirror-view'
    ],
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html')
    }
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_']
})
