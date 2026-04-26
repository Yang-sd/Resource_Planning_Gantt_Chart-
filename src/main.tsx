import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const APP_ICON_PATH = '/app-icon-20260426.svg'

function refreshTabIcon() {
  const head = document.head
  const href = `${APP_ICON_PATH}?boot=${Date.now()}`

  head.querySelectorAll('link[rel*="icon"]').forEach((link) => link.remove())

  for (const rel of ['icon', 'shortcut icon']) {
    const link = document.createElement('link')
    link.rel = rel
    link.type = 'image/svg+xml'
    link.href = href
    head.appendChild(link)
  }
}

refreshTabIcon()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
