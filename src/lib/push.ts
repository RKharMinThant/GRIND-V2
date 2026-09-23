// Web Push: pure helpers for the browser half of notifications.
// The type ids below are the contract with the dispatcher —
// they must stay in step with supabase/functions/_shared/notifyRules.ts.

export type NotificationType =
  | 'workout_done'
  | 'fitbit_expired'
  | 'inactivity'
  | 'streak_risk'
  | 'step_goal'
  | 'recovery_milestone'
  | 'rest_day'

export type NotificationPrefs = Partial<Record<NotificationType, boolean>>

/** Settings rows, in the order they're shown. `needsFitbit` ones are hidden without a connection. */
export const NOTIFICATION_TYPES: {
  id: NotificationType
  label: string
  description: string
  needsFitbit: boolean
}[] = [
  {
    id: 'workout_done',
    label: 'Workout finished',
    description: 'A summary as soon as Fitbit syncs a session, with a tap to log it',
    needsFitbit: true,
  },
  {
    id: 'fitbit_expired',
    label: 'Fitbit needs reconnecting',
    description: 'When the connection drops, so the Body tab never quietly goes stale',
    needsFitbit: true,
  },
  {
    id: 'streak_risk',
    label: 'Streak about to break',
    description: "Evening nudge when you've trained recently but not today",
    needsFitbit: false,
  },
  {
    id: 'rest_day',
    label: 'Rest day check-in',
    description: 'Around 11pm after three training days, if no workout showed up',
    needsFitbit: false,
  },
  {
    id: 'inactivity',
    label: 'Back to it',
    description: 'After a few days without a session',
    needsFitbit: false,
  },
  {
    id: 'step_goal',
    label: 'Step goal within reach',
    description: 'Early evening, when you’re close enough to still close it',
    needsFitbit: true,
  },
  {
    id: 'recovery_milestone',
    label: 'Recovery milestones',
    description: 'Standout sleep or a resting heart rate trending down',
    needsFitbit: true,
  },
]

export function isNotificationOn(prefs: NotificationPrefs, type: NotificationType): boolean {
  return prefs[type] === true
}

export function withNotificationPref(
  prefs: NotificationPrefs,
  type: NotificationType,
  on: boolean,
): NotificationPrefs {
  return { ...prefs, [type]: on }
}

export function anyNotificationOn(prefs: NotificationPrefs): boolean {
  return Object.values(prefs).some(Boolean)
}

/** base64url VAPID key → the raw bytes `pushManager.subscribe` wants. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  // Backed by a plain ArrayBuffer so it satisfies BufferSource for subscribe()
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export type PushSupport = 'supported' | 'needs-install' | 'unsupported'

type SupportEnv = {
  serviceWorker: boolean
  pushManager: boolean
  notification: boolean
  ios: boolean
  standalone: boolean
}

/**
 * iOS only exposes PushManager once the app is on the Home Screen, so a missing
 * PushManager there is an instruction ("install it"), not a dead end.
 */
export function pushSupport(env: SupportEnv): PushSupport {
  if (env.serviceWorker && env.pushManager && env.notification) return 'supported'
  if (env.ios && !env.standalone) return 'needs-install'
  return 'unsupported'
}

/** Reads the real browser. Split from `pushSupport` so the logic stays testable. */
export function detectPushSupport(): PushSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported'
  const nav = navigator as Navigator & { standalone?: boolean }
  return pushSupport({
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    notification: 'Notification' in window,
    ios: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    standalone: nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches,
  })
}

/** The phone's IANA zone, e.g. "Asia/Yangon" — sent at subscribe time so rules fire locally. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** How far back a rest-day link may reach: a late tap, not an old notification. */
const REST_LINK_MAX_AGE_DAYS = 7

/**
 * The date from a rest-day notification link (/app?rest=YYYY-MM-DD), if it's one we
 * should act on. It comes from a URL, so it is validated rather than trusted.
 */
export function restDeepLinkDate(value: string | null, today: string): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const time = Date.parse(`${value}T00:00:00Z`)
  // Rejects impossible dates like 2026-13-40, which Date would otherwise roll over
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) return null
  const age = (Date.parse(`${today}T00:00:00Z`) - time) / 86_400_000
  if (age < 0 || age > REST_LINK_MAX_AGE_DAYS) return null
  return value
}
