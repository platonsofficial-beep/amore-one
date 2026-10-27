/* Classic script imported by the generated Workbox service worker.
   Handles web push and opens the app on the payload view. */

function absoluteAppUrl(url, notificationId) {
  const base = `${url || '/'}`.trim() || '/'
  let target
  try {
    target = new URL(base, self.location.origin)
  } catch {
    target = new URL('/', self.location.origin)
  }
  if (notificationId) target.searchParams.set('notif', notificationId)
  return target.href
}

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'ONE', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'ONE'
  const tag = payload.tag || payload.type || payload.id || 'one'

  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || '',
    tag,
    data: payload,
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const payload = event.notification?.data || {}
  const targetUrl = absoluteAppUrl(payload.url, payload.id)

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = clients.find((client) => {
      try {
        return new URL(client.url).origin === self.location.origin
      } catch {
        return false
      }
    })

    if (existing) {
      if (typeof existing.focus === 'function') await existing.focus()
      existing.postMessage({ type: 'one:notification-open', payload })
      return
    }

    await self.clients.openWindow(targetUrl)
  })())
})
