import { useCallback, useEffect, useRef, useState } from 'react'
import { invokeFunction } from '../lib/invokeFunction'
import {
  browserTimeZone,
  detectPushSupport,
  urlBase64ToUint8Array,
  type PushSupport,
} from '../lib/push'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

/** Re-register with the server at most daily, so a pruned row heals itself. */
const RESYNC_KEY = 'grind_push_resync'
const RESYNC_EVERY_MS = 24 * 60 * 60 * 1000

export type PushState = {
  support: PushSupport
  /** False when VITE_VAPID_PUBLIC_KEY isn't set — the feature is hidden rather than broken. */
  configured: boolean
  permission: NotificationPermission
  subscribed: boolean
  busy: boolean
  error: string | null
  enable: () => Promise<void>
  disable: () => Promise<void>
  sendTest: () => Promise<void>
}

const describe = (status: number, payload: { detail?: string; error?: string } | null) =>
  payload?.detail || payload?.error || `Notification request failed (${status})`

function saveSubscription(sub: PushSubscription): Promise<unknown> {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  return invokeFunction(
    'push-subscribe',
    {
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      timeZone: browserTimeZone(),
      userAgent: navigator.userAgent.slice(0, 200),
    },
    { offline: "Couldn't reach the server", describe },
  )
}

function markResynced() {
  try {
    localStorage.setItem(RESYNC_KEY, String(Date.now()))
  } catch {
    /* private mode — just re-sync next load */
  }
}

function resyncDue(): boolean {
  try {
    const last = Number(localStorage.getItem(RESYNC_KEY) ?? 0)
    return !last || Date.now() - last > RESYNC_EVERY_MS
  } catch {
    return false
  }
}

/**
 * Web Push registration for this device.
 *
 * The browser's own subscription is the source of truth for "is this device on" —
 * the database can't know that the user deleted the home-screen app.
 */
export function usePush(enabled: boolean): PushState {
  const [support, setSupport] = useState<PushSupport>('unsupported')
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const registration = useRef<ServiceWorkerRegistration | null>(null)

  const configured = VAPID_PUBLIC_KEY.length > 0

  const ready = useCallback(async (): Promise<ServiceWorkerRegistration> => {
    registration.current ??= await navigator.serviceWorker.register('/sw.js')
    // `register` resolves before the worker is usable for subscribing
    return navigator.serviceWorker.ready
  }, [])

  useEffect(() => {
    if (!enabled || !configured) return
    const detected = detectPushSupport()
    setSupport(detected)
    if (detected !== 'supported') return

    setPermission(Notification.permission)
    let cancelled = false

    void (async () => {
      try {
        const reg = await ready()
        if (cancelled) return
        const existing = await reg.pushManager.getSubscription()
        if (cancelled) return
        setSubscribed(Boolean(existing))
        // Heal a subscription the server has forgotten (row pruned, database restored)
        if (existing && Notification.permission === 'granted' && resyncDue()) {
          await saveSubscription(existing)
          markResynced()
        }
      } catch {
        /* registration failures surface when the user actually taps Enable */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, configured, ready])

  const enable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const reg = await ready()
      // iOS only shows the prompt from a user gesture, which is why this lives behind a button
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') {
        throw new Error(
          result === 'denied'
            ? 'Notifications are blocked. Turn them back on in iOS Settings → Notifications → GRIND.'
            : 'Notification permission was dismissed.',
        )
      }

      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }))

      await saveSubscription(sub)
      markResynced()
      setSubscribed(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enable notifications')
    } finally {
      setBusy(false)
    }
  }, [ready])

  const disable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const reg = await ready()
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        // Tell the server first: if unsubscribing succeeds but the call fails,
        // the row lingers and we'd push into a dead endpoint.
        await invokeFunction(
          'push-unsubscribe',
          { endpoint: sub.endpoint },
          { offline: "Couldn't reach the server", describe },
        )
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn notifications off')
    } finally {
      setBusy(false)
    }
  }, [ready])

  const sendTest = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await invokeFunction('push-test', {}, { offline: "Couldn't reach the server", describe })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send a test notification')
    } finally {
      setBusy(false)
    }
  }, [])

  return { support, configured, permission, subscribed, busy, error, enable, disable, sendTest }
}
