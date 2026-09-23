import { describe, expect, it } from 'vitest'
import {
  NOTIFICATION_TYPES,
  anyNotificationOn,
  isNotificationOn,
  pushSupport,
  restDeepLinkDate,
  urlBase64ToUint8Array,
  withNotificationPref,
} from './push'

describe('urlBase64ToUint8Array', () => {
  it('decodes an unpadded base64url VAPID key to 65 raw bytes', () => {
    const key = 'BI5SNxir0PS1YSAYDA5wctgA0LgxyH12JGwedJ5wx5xnubFkO4CyUVvPPNVj9wCi5uPKugh1i8jVN1O7VukTVys'
    const bytes = urlBase64ToUint8Array(key)
    expect(bytes).toBeInstanceOf(Uint8Array)
    // Uncompressed P-256 point: 0x04 marker + 32-byte X + 32-byte Y
    expect(bytes.length).toBe(65)
    expect(bytes[0]).toBe(4)
  })

  it('maps the url-safe alphabet back to standard base64', () => {
    // "-" and "_" must decode as "+" and "/" or the key is silently wrong
    expect(Array.from(urlBase64ToUint8Array('-_8='))).toEqual([251, 255])
  })
})

describe('notification preferences', () => {
  it('treats a missing key as off, so a new type never sends on its own', () => {
    expect(isNotificationOn({}, 'step_goal')).toBe(false)
    expect(isNotificationOn({ step_goal: false }, 'step_goal')).toBe(false)
    expect(isNotificationOn({ step_goal: true }, 'step_goal')).toBe(true)
  })

  it('sets a preference without mutating the original', () => {
    const before = { inactivity: true }
    const after = withNotificationPref(before, 'step_goal', true)
    expect(after).toEqual({ inactivity: true, step_goal: true })
    expect(before).toEqual({ inactivity: true })
  })

  it('turning one off leaves the others alone', () => {
    expect(withNotificationPref({ inactivity: true, step_goal: true }, 'step_goal', false)).toEqual({
      inactivity: true,
      step_goal: false,
    })
  })

  it('knows whether anything is on at all', () => {
    expect(anyNotificationOn({})).toBe(false)
    expect(anyNotificationOn({ step_goal: false })).toBe(false)
    expect(anyNotificationOn({ step_goal: false, inactivity: true })).toBe(true)
  })

  it('every declared type has a label and a unique id', () => {
    const ids = NOTIFICATION_TYPES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of NOTIFICATION_TYPES) expect(t.label.length).toBeGreaterThan(0)
  })
})

describe('pushSupport', () => {
  const full = { serviceWorker: true, pushManager: true, notification: true, ios: false, standalone: false }

  it('is supported on a browser with the full API', () => {
    expect(pushSupport(full)).toBe('supported')
  })

  it('tells an iPhone user to install first rather than calling it unsupported', () => {
    // Safari on iOS hides PushManager until the app is on the Home Screen
    expect(pushSupport({ ...full, pushManager: false, ios: true, standalone: false })).toBe('needs-install')
  })

  it('is supported on an installed iPhone app', () => {
    expect(pushSupport({ ...full, ios: true, standalone: true })).toBe('supported')
  })

  it('is unsupported on a desktop browser without push', () => {
    expect(pushSupport({ ...full, pushManager: false })).toBe('unsupported')
  })

  it('is unsupported without a service worker', () => {
    expect(pushSupport({ ...full, serviceWorker: false })).toBe('unsupported')
  })
})

describe('restDeepLinkDate', () => {
  const today = '2026-09-23'

  it('accepts the day the notification was about', () => {
    expect(restDeepLinkDate('2026-09-23', today)).toBe('2026-09-23')
  })

  it('accepts yesterday, for a tap after midnight', () => {
    expect(restDeepLinkDate('2026-09-22', today)).toBe('2026-09-22')
  })

  it('rejects a future date', () => {
    expect(restDeepLinkDate('2026-09-24', today)).toBeNull()
  })

  it('rejects anything older than a week — a stale notification, not a quick log', () => {
    expect(restDeepLinkDate('2026-09-10', today)).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(restDeepLinkDate(null, today)).toBeNull()
    expect(restDeepLinkDate('', today)).toBeNull()
    expect(restDeepLinkDate('1', today)).toBeNull()
    expect(restDeepLinkDate('2026-9-23', today)).toBeNull()
    expect(restDeepLinkDate('2026-13-40', today)).toBeNull()
  })
})
