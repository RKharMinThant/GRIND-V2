/**
 * GRIND service worker — push notifications only.
 *
 * Deliberately has no `fetch` handler: the app is online-only, and an empty
 * pass-through handler would add a hop to every request for nothing.
 */

// Take over immediately so a redeployed worker doesn't wait for every tab to close.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'GRIND'
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    // `tag` collapses a repeat of the same kind instead of stacking banners
    tag: payload.tag || 'grind',
    renotify: false,
    data: { url: payload.url || '/app' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/app'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Focus an open GRIND window rather than opening a second one
      for (const client of windows) {
        if (client.url.includes('/app') && 'focus' in client) {
          if ('navigate' in client && target !== '/app') client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
