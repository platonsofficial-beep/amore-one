import {
  bindPwaFormDirtyTracking,
  bindPwaUpdateChecks,
  decidePwaUpdateAction,
  markPwaUpdateAvailable,
} from './lib/pwaUpdate.js'

export async function registerPwaServiceWorker() {
  if (!import.meta.env.PROD) return
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  bindPwaFormDirtyTracking(window)

  const { registerSW } = await import('virtual:pwa-register')
  registerSW({
    immediate: true,
    onOfflineReady() {
      // App shell cached; live data still requires network.
    },
    onNeedReload() {
      const action = decidePwaUpdateAction(window.document, window.sessionStorage)
      if (action === 'banner') {
        markPwaUpdateAvailable()
        return
      }
      if (action === 'reload') window.location.reload()
    },
    onRegisteredSW(_swUrl, registration) {
      if (registration) bindPwaUpdateChecks(registration, window)
    },
  })
}
