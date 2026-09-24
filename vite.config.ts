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
  optimizeDeps: {
    include: [
      '@univerjs/core',
      '@univerjs/preset-sheets-core',
      '@univerjs/preset-sheets-drawing',
      '@univerjs/preset-docs-core',
      '@univerjs/preset-docs-drawing',
      'leaflet',
      'react-leaflet',
      'rxjs',
      'pdfjs-dist',
      'chart.js',
      'lucide-react'
    ]
  },
  plugins: [
    react({
      babel: {
        plugins: [
          [
            'babel-plugin-react-compiler',
            {
              // Bail loudly instead of silently skipping components that
              // violate the Rules of React. `npm run lint` reports them too.
              panicThreshold: 'critical_errors'
            }
          ]
        ]
      }
    })
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Browser/Vite sessions cannot fetch R2 tiles directly (the bucket sends
      // no CORS headers). Forward them same-origin; the desktop app never uses
      // this path — its capture downloads tiles through the Rust image command.
      '/__r2_tiles': {
        target: 'https://pub-1f022f4a6cbd43dab0ae7f7752d325b4.r2.dev',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__r2_tiles/, '')
      }
    }
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
