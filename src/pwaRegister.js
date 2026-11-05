import {
  bindPwaFormDirtyTracking,
  bindPwaHiddenReload,
  bindPwaUpdateChecks,
  decidePwaUpdateAction,
  markPwaUpdateAvailable,
} from './lib/pwaUpdate.js'

export async function registerPwaServiceWorker() {
  if (!import.meta.env.PROD) return
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  bindPwaFormDirtyTracking(window)
  bindPwaHiddenReload(window)

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
      // Reloaded <15s ago: keep the update pending so the banner or the next background applies it.
      else markPwaUpdateAvailable()
    },
    onRegisteredSW(_swUrl, registration) {
      if (registration) bindPwaUpdateChecks(registration, window)
    },
  })
}
