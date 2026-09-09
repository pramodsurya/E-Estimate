import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles/styles.css'
import App from './App'
import { installPlatformApi } from './lib/platformApi'

async function bootstrap(): Promise<void> {
  await installPlatformApi()
  createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void bootstrap()
