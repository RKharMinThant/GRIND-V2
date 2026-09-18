import { useEffect, useState } from 'react'
import type { PushState } from '../hooks/usePush'
import {
  NOTIFICATION_TYPES,
  isNotificationOn,
  withNotificationPref,
  type NotificationPrefs,
  type NotificationType,
} from '../lib/push'

type Props = {
  push: PushState
  prefs: NotificationPrefs
  fitbitConnected: boolean
  onChange: (prefs: NotificationPrefs) => Promise<void>
}

function Switch({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="notify-row">
      <div className="notify-text">
        <span className="setting-row-label">{label}</span>
        <p className="settings-note">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch ${checked ? 'on' : ''}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-knob" aria-hidden />
      </button>
    </div>
  )
}

/**
 * Notification settings for this device.
 *
 * Permission belongs to the device and the toggles belong to the account, so a
 * phone that hasn't been enabled shows the button rather than a list of switches
 * that would silently do nothing.
 */
export function NotificationsCard({ push, prefs, fitbitConnected, onChange }: Props) {
  const [local, setLocal] = useState<NotificationPrefs>(prefs)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => setLocal(prefs), [prefs])

  // Nothing to configure until a VAPID key is deployed
  if (!push.configured) return null

  async function toggle(type: NotificationType, on: boolean) {
    const next = withNotificationPref(local, type, on)
    setLocal(next) // move the switch now; the round-trip shouldn't feel laggy
    setSaveError(null)
    try {
      await onChange(next)
    } catch (e) {
      setLocal(local)
      setSaveError(e instanceof Error ? e.message : 'Could not save')
    }
  }

  const rows = NOTIFICATION_TYPES.filter((t) => !t.needsFitbit || fitbitConnected)
  const error = push.error ?? saveError

  return (
    <section className="settings-card" aria-label="Notifications">
      <h2 className="settings-title">Notifications</h2>

      {push.support === 'needs-install' && (
        <p className="settings-note">
          Add GRIND to your Home Screen first — iPhone only delivers notifications to installed
          apps. Tap Share, then <strong>Add to Home Screen</strong>, and open it from there.
        </p>
      )}

      {push.support === 'unsupported' && (
        <p className="settings-note">
          This browser can&rsquo;t receive notifications. Try the app on your phone&rsquo;s Home
          Screen, or in Chrome, Edge or Firefox on a computer.
        </p>
      )}

      {push.support === 'supported' && !push.subscribed && (
        <>
          <p className="settings-note">
            A nudge when your streak is on the line or Fitbit needs reconnecting. Nothing else.
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={push.busy}
              onClick={() => void push.enable()}
            >
              {push.busy ? 'Enabling…' : 'Enable on this device'}
            </button>
          </div>
        </>
      )}

      {push.support === 'supported' && push.subscribed && (
        <>
          {rows.map((t) => (
            <Switch
              key={t.id}
              label={t.label}
              description={t.description}
              checked={isNotificationOn(local, t.id)}
              onChange={(on) => void toggle(t.id, on)}
            />
          ))}

          {!fitbitConnected && (
            <p className="settings-note">Connect Fitbit to get sleep, steps and recovery alerts.</p>
          )}

          <div className="settings-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={push.busy}
              onClick={() => void push.sendTest()}
            >
              Send a test
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={push.busy}
              onClick={() => void push.disable()}
            >
              Turn off on this device
            </button>
          </div>
        </>
      )}

      {error && <div className="settings-error">{error}</div>}
    </section>
  )
}
