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
    <div className="list-row set-switch-row">
      <div className="set-switch-text">
        <span className="set-switch-label">{label}</span>
        <p className="set-switch-desc">{description}</p>
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

  const title = <h2 className="set-group-title">Notifications</h2>

  return (
    <section className="set-group" aria-label="Notifications">
      {title}

      {push.support === 'needs-install' && (
        <div className="list-group">
          <p className="list-row set-row-note">
            Add GRIND to your Home Screen first — iPhone only delivers notifications to installed
            apps. Tap Share, then <strong>Add to Home Screen</strong>, and open it from there.
          </p>
        </div>
      )}

      {push.support === 'unsupported' && (
        <div className="list-group">
          <p className="list-row set-row-note">
            This browser can&rsquo;t receive notifications. Try the app on your phone&rsquo;s Home
            Screen, or in Chrome, Edge or Firefox on a computer.
          </p>
        </div>
      )}

      {push.support === 'supported' && !push.subscribed && (
        <>
          <div className="list-group">
            <button
              type="button"
              className="list-row set-action"
              disabled={push.busy}
              onClick={() => void push.enable()}
            >
              {push.busy ? 'Enabling…' : 'Enable on this device'}
            </button>
          </div>
          <p className="set-footer">
            A nudge when your streak is on the line or Fitbit needs reconnecting. Nothing else.
          </p>
        </>
      )}

      {push.support === 'supported' && push.subscribed && (
        <>
          <div className="list-group">
            {rows.map((t) => (
              <Switch
                key={t.id}
                label={t.label}
                description={t.description}
                checked={isNotificationOn(local, t.id)}
                onChange={(on) => void toggle(t.id, on)}
              />
            ))}
            <button
              type="button"
              className="list-row set-action"
              disabled={push.busy}
              onClick={() => void push.sendTest()}
            >
              Send a test
            </button>
            <button
              type="button"
              className="list-row set-action set-action--danger"
              disabled={push.busy}
              onClick={() => void push.disable()}
            >
              Turn off on this device
            </button>
          </div>
          {!fitbitConnected && (
            <p className="set-footer">Connect Fitbit to get sleep, steps and recovery alerts.</p>
          )}
        </>
      )}

      {error && (
        <p className="set-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
