import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// CLAUDE.md section 45: the core booth must keep working after the initial
// install without a network connection. Registered here, after first
// render, rather than blocking startup on it -- best-effort (section 49):
// a browser without SW support, or a registration that fails for any
// reason, just means no offline resilience, not a broken booth. See
// public/sw.js for the actual caching strategy.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Ghost Booth: service worker registration failed', err)
    })
  })
}
