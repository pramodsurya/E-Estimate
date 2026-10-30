import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles/styles.css'; import './styles/cluster.css'
import App from './App'
import { installPlatformApi } from './lib/platformApi'
import canalSectionWasmUrl from './generated/canal-section-engine.wasm?url'
import { initializeCanalSectionEngine } from './lib/canalBankSection'

async function bootstrap(): Promise<void> {
  await installPlatformApi()
  const response = await fetch(canalSectionWasmUrl)
  if (!response.ok) throw new Error('Cannot load the canal section engine.')
  initializeCanalSectionEngine(await response.arrayBuffer())
  createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void bootstrap()
