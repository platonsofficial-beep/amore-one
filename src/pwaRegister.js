export async function registerPwaServiceWorker() {
  if (!import.meta.env.PROD) return

  const { registerSW } = await import('virtual:pwa-register')
  registerSW({
    immediate: true,
    onOfflineReady() {
      // App shell cached; live data still requires network.
    },
  })
}
