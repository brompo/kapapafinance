import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  navigator.serviceWorker?.getRegistrations?.().then((regs) => {
    regs.forEach((reg) => reg.unregister())
  })
} else {
  // Production PWA Auto-Updater
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh() { }, // autoUpdate handles this directly via skipWaiting
      onOfflineReady() { },
    })

    // Force check for updates every time the app is brought back to the foreground
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker?.ready.then((reg) => {
          reg.update()
        })
      }
    })

    // When a new SW activates, it takes control of the page.
    let refreshing = false
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      localStorage.setItem('appUpdated', 'true')
      window.location.reload()
    })
  }).catch((err) => {
    console.error('SW registration failed', err)
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
