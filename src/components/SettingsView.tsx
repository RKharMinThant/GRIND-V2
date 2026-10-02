import { useEffect, useState, type ReactNode } from 'react'
import { toLocalDateString } from '../lib/dates'
import { relativeSync } from '../health/logic'
import type { PushState } from '../hooks/usePush'
import type { HealthState } from '../health/useHealth'
import { buildExportJson, downloadText, exportFilename, logsToCsv } from '../lib/exportData'
import type { NotificationPrefs } from '../lib/push'
import type { DistanceUnit, WeekStart, WeightUnit } from '../lib/units'
import type { Log, TrackedLift } from '../types/database'
import { NotificationsCard } from './NotificationsCard'
import { ThemeSegment } from './ThemeControls'
import type { ThemePreference } from '../lib/theme'

export type ProfilePatch = {
  display_name?: string
  weekly_goal?: number
  daily_step_goal?: number
  distance_unit?: DistanceUnit
  weight_unit?: WeightUnit
  week_start?: WeekStart
  notification_prefs?: NotificationPrefs
  birth_date?: string | null
  sex?: 'male' | 'female'
}

type Props = {
  email: string
  displayName: string
  weeklyGoal: number
  dailyStepGoal: number
  distanceUnit: DistanceUnit
  weightUnit: WeightUnit
  weekStart: WeekStart
  notificationPrefs: NotificationPrefs
  birthDate: string | null
  sex: 'male' | 'female' | null
  push: PushState
  themePreference: ThemePreference
  onThemeChange: (pref: ThemePreference) => void
  onUpdateProfile: (patch: ProfilePatch) => Promise<void>
  health: HealthState
  logs: Log[]
  lifts: TrackedLift[]
  isAdmin?: boolean
  onAdminPanel?: () => void
  onSignOut: () => void
  onBack: () => void
}

const APP_VERSION = __APP_VERSION__

/** iOS group: footnote header above an inset grouped list, optional footnote below. */
function Group({
  title,
  label,
  footer,
  tight,
  children,
}: {
  title?: string
  label: string
  footer?: ReactNode
  /** Followed by its own action button, so the gap below is 16px instead of 32px */
  tight?: boolean
  children: ReactNode
}) {
  return (
    <section className={`set-group${tight ? ' set-group--tight' : ''}`} aria-label={label}>
      {title && <h2 className="set-group-title">{title}</h2>}
      <div className="list-group">{children}</div>
      {footer && <p className="set-footer">{footer}</p>}
    </section>
  )
}

function Segment<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="list-row">
      <span className="list-row-label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className={value === o.value ? 'active' : ''}
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Full settings screen, opened from the profile chip. */
export function SettingsView({
  email,
  displayName,
  weeklyGoal,
  dailyStepGoal,
  distanceUnit,
  weightUnit,
  weekStart,
  notificationPrefs,
  birthDate,
  sex,
  push,
  themePreference,
  onThemeChange,
  onUpdateProfile,
  health,
  logs,
  lifts,
  isAdmin,
  onAdminPanel,
  onSignOut,
  onBack,
}: Props) {
  const [name, setName] = useState(displayName)
  const [goal, setGoal] = useState(String(weeklyGoal))
  const [stepGoal, setStepGoal] = useState(String(dailyStepGoal))
  const [birth, setBirth] = useState(birthDate ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(displayName)
    setGoal(String(weeklyGoal))
    setStepGoal(String(dailyStepGoal))
    setBirth(birthDate ?? '')
  }, [displayName, weeklyGoal, dailyStepGoal, birthDate])

  async function save(patch: ProfilePatch, quiet = false) {
    setSaving(true)
    setError(null)
    try {
      await onUpdateProfile(patch)
      if (!quiet) {
        setSaved(true)
        setTimeout(() => setSaved(false), 1600)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const connection = health.connection
  const status = connection?.status ?? 'disconnected'

  return (
    <div className="page settings-page">
      <div className="set-head">
        <button type="button" className="set-back" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 12 20" aria-hidden>
            <path d="M10 2 2 10l8 8" />
          </svg>
          Back
        </button>
        <h1 className="page-title">Settings</h1>
      </div>

      <Group
        title="Profile"
        label="Profile"
        tight
        footer="Used only to work out your GRIND Age."
      >
        <label className="list-row set-field" htmlFor="setName">
          <span className="list-row-label">Name</span>
          <input
            id="setName"
            className="set-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoComplete="nickname"
          />
        </label>
        <label className="list-row set-field" htmlFor="setGoal">
          <span className="list-row-label">Weekly goal</span>
          <input
            id="setGoal"
            className="set-input num-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={14}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </label>
        <label className="list-row set-field" htmlFor="setSteps">
          <span className="list-row-label">Daily step goal</span>
          <input
            id="setSteps"
            className="set-input num-input"
            type="number"
            inputMode="numeric"
            min={1000}
            max={100000}
            step={500}
            value={stepGoal}
            onChange={(e) => setStepGoal(e.target.value)}
          />
        </label>
        <label className="list-row set-field" htmlFor="setBirth">
          <span className="list-row-label">Birth date</span>
          <input
            id="setBirth"
            className="set-input"
            type="date"
            min="1900-01-01"
            max={toLocalDateString()}
            value={birth}
            onChange={(e) => setBirth(e.target.value)}
          />
        </label>
        <Segment
          label="Sex"
          value={sex ?? ('' as 'male' | 'female' | '')}
          options={[
            { value: 'male' as const, label: 'Male' },
            { value: 'female' as const, label: 'Female' },
          ]}
          onChange={(v) => v && void save({ sex: v }, true)}
        />
      </Group>

      {error && (
        <p className="set-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary btn-full set-save"
        disabled={saving}
        onClick={() =>
          void save({
            display_name: name.trim() || displayName,
            weekly_goal: Math.min(14, Math.max(1, Number(goal) || 4)),
            daily_step_goal: Math.min(100000, Math.max(1000, Math.round((Number(stepGoal) || 10000) / 500) * 500)),
            ...(birth && birth !== (birthDate ?? '') ? { birth_date: birth } : {}),
          })
        }
      >
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save profile'}
      </button>

      <Group title="Appearance" label="Appearance">
        <div className="list-row set-row-control">
          <ThemeSegment preference={themePreference} onChange={onThemeChange} />
        </div>
      </Group>

      <Group
        title="Units & week"
        label="Units and week"
        footer="New lifts start in your chosen unit; existing lifts keep theirs."
      >
        <Segment
          label="Distance"
          value={distanceUnit}
          options={[
            { value: 'km' as DistanceUnit, label: 'km' },
            { value: 'mi' as DistanceUnit, label: 'miles' },
          ]}
          onChange={(v) => void save({ distance_unit: v }, true)}
        />
        <Segment
          label="Lift weight"
          value={weightUnit}
          options={[
            { value: 'kg' as WeightUnit, label: 'kg' },
            { value: 'lb' as WeightUnit, label: 'lb' },
          ]}
          onChange={(v) => void save({ weight_unit: v }, true)}
        />
        <Segment
          label="Week starts on"
          value={weekStart}
          options={[
            { value: 0 as WeekStart, label: 'Sunday' },
            { value: 1 as WeekStart, label: 'Monday' },
          ]}
          onChange={(v) => void save({ week_start: v }, true)}
        />
      </Group>

      {health.enabled && (
        <Group
          title="Fitbit"
          label="Fitbit"
          footer={
            status === 'connected'
              ? `Source: ${health.source === 'demo' ? 'demo data' : 'Google Health'}.`
              : 'Workouts, sleep, heart rate and steps.'
          }
        >
          <div className="list-row">
            <span className="list-row-label set-status">
              <span className="set-dot" data-status={status} aria-hidden />
              {status === 'connected' ? 'Connected' : status === 'expired' ? 'Connection expired' : 'Not connected'}
            </span>
            {status === 'connected' && (
              <span className="list-row-value">Synced {relativeSync(connection?.lastSyncedAt ?? null)}</span>
            )}
          </div>
          {status === 'connected' ? (
            <>
              <button
                type="button"
                className="list-row set-action"
                onClick={() => void health.sync()}
                disabled={health.loading}
              >
                {health.loading ? 'Syncing…' : 'Sync now'}
              </button>
              <button type="button" className="list-row set-action set-action--danger" onClick={() => void health.disconnect()}>
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="list-row set-action"
              onClick={() => void health.connect()}
              disabled={health.connecting || !connection}
            >
              {health.connecting ? 'Connecting…' : status === 'expired' ? 'Reconnect' : 'Connect Fitbit'}
            </button>
          )}
          {health.error && (
            <div className="list-row set-row-error">
              <span className="list-row-label">{health.error}</span>
              <button type="button" className="set-inline-btn" onClick={() => void health.sync()}>
                Retry
              </button>
            </div>
          )}
        </Group>
      )}

      {/* onChange goes straight to the profile update so a failure surfaces on the switch itself */}
      <NotificationsCard
        push={push}
        prefs={notificationPrefs}
        fitbitConnected={status === 'connected'}
        onChange={(next) => onUpdateProfile({ notification_prefs: next })}
      />

      <Group
        title="Data"
        label="Data"
        footer={`${logs.length} session${logs.length === 1 ? '' : 's'} · ${lifts.length} lift${
          lifts.length === 1 ? '' : 's'
        }`}
      >
        <button
          type="button"
          className="list-row set-action"
          onClick={() =>
            downloadText(exportFilename('json'), buildExportJson(logs, lifts), 'application/json')
          }
        >
          Export JSON
        </button>
        <button
          type="button"
          className="list-row set-action"
          onClick={() => downloadText(exportFilename('csv'), logsToCsv(logs), 'text/csv')}
        >
          Sessions as CSV
        </button>
      </Group>

      <Group title="Account" label="Account">
        <div className="list-row">
          <span className="list-row-label">Signed in as</span>
          <span className="list-row-value set-email">{email}</span>
        </div>
        {isAdmin && onAdminPanel && (
          <button type="button" className="list-row list-row--nav" onClick={onAdminPanel}>
            <span className="list-row-label">Admin panel</span>
          </button>
        )}
      </Group>

      <Group label="Sign out">
        <button type="button" className="list-row set-action set-action--center set-action--danger" onClick={onSignOut}>
          Sign out
        </button>
      </Group>

      <p className="set-about t-caption">
        GRIND v{APP_VERSION} · <a href="/">grind marketing site</a>
      </p>
    </div>
  )
}
