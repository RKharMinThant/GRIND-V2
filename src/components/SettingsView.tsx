import { useEffect, useState } from 'react'
import { relativeSync } from '../health/logic'
import type { HealthState } from '../health/useHealth'
import { buildExportJson, downloadText, exportFilename, logsToCsv } from '../lib/exportData'
import type { DistanceUnit, WeekStart, WeightUnit } from '../lib/units'
import type { Log, TrackedLift } from '../types/database'
import { ThemeSegment } from './ThemeControls'
import type { ThemePreference } from '../lib/theme'

export type ProfilePatch = {
  display_name?: string
  weekly_goal?: number
  daily_step_goal?: number
  distance_unit?: DistanceUnit
  weight_unit?: WeightUnit
  week_start?: WeekStart
}

type Props = {
  email: string
  displayName: string
  weeklyGoal: number
  dailyStepGoal: number
  distanceUnit: DistanceUnit
  weightUnit: WeightUnit
  weekStart: WeekStart
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
    <div className="setting-row">
      <span className="setting-row-label">{label}</span>
      <div className="mode-seg" role="group" aria-label={label}>
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
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(displayName)
    setGoal(String(weeklyGoal))
    setStepGoal(String(dailyStepGoal))
  }, [displayName, weeklyGoal, dailyStepGoal])

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
      <div className="page-header">
        <div className="settings-head">
          <button type="button" className="btn btn-icon" onClick={onBack} aria-label="Back">
            ←
          </button>
          <div className="page-title">Settings</div>
        </div>
      </div>

      <section className="settings-card" aria-label="Profile">
        <h2 className="settings-title">Profile</h2>
        <div className="field">
          <label htmlFor="setName">Display name</label>
          <input id="setName" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="setGoal">Weekly session goal</label>
            <input
              id="setGoal"
              type="number"
              inputMode="numeric"
              min={1}
              max={14}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="setSteps">Daily step goal</label>
            <input
              id="setSteps"
              type="number"
              inputMode="numeric"
              min={1000}
              max={100000}
              step={500}
              value={stepGoal}
              onChange={(e) => setStepGoal(e.target.value)}
            />
          </div>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <button
          type="button"
          className="btn btn-primary btn-full"
          disabled={saving}
          onClick={() =>
            void save({
              display_name: name.trim() || displayName,
              weekly_goal: Math.min(14, Math.max(1, Number(goal) || 4)),
              daily_step_goal: Math.min(100000, Math.max(1000, Math.round((Number(stepGoal) || 10000) / 500) * 500)),
            })
          }
        >
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save profile'}
        </button>
      </section>

      <section className="settings-card" aria-label="Appearance">
        <h2 className="settings-title">Appearance</h2>
        <ThemeSegment preference={themePreference} onChange={onThemeChange} />
      </section>

      <section className="settings-card" aria-label="Units and week">
        <h2 className="settings-title">Units &amp; week</h2>
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
        <p className="settings-note">New lifts start in your chosen unit; existing lifts keep theirs.</p>
      </section>

      {health.enabled && (
        <section className="settings-card" aria-label="Fitbit">
          <h2 className="settings-title">Fitbit</h2>
          <div className="setting-row">
            <span className="setting-row-label">
              <span className="health-dot" data-status={status} aria-hidden />
              {status === 'connected' ? 'Connected' : status === 'expired' ? 'Connection expired' : 'Not connected'}
            </span>
            <span className="settings-note">
              {status === 'connected'
                ? `${health.source === 'demo' ? 'Demo data' : 'Google Health'} · synced ${relativeSync(
                    connection?.lastSyncedAt ?? null,
                  )}`
                : 'Workouts, sleep, heart rate and steps'}
            </span>
          </div>
          <div className="settings-actions">
            {status === 'connected' ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void health.sync()}
                  disabled={health.loading}
                >
                  {health.loading ? 'Syncing…' : 'Sync now'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void health.disconnect()}>
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void health.connect()}
                disabled={health.connecting || !connection}
              >
                {health.connecting ? 'Connecting…' : status === 'expired' ? 'Reconnect' : 'Connect Fitbit'}
              </button>
            )}
          </div>
          {health.error && (
            <div className="settings-error">
              <span>{health.error}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void health.sync()}>
                Retry
              </button>
            </div>
          )}
        </section>
      )}

      <section className="settings-card" aria-label="Data">
        <h2 className="settings-title">Data</h2>
        <p className="settings-note">
          {logs.length} session{logs.length === 1 ? '' : 's'} · {lifts.length} lift
          {lifts.length === 1 ? '' : 's'}
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              downloadText(exportFilename('json'), buildExportJson(logs, lifts), 'application/json')
            }
          >
            Export JSON
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => downloadText(exportFilename('csv'), logsToCsv(logs), 'text/csv')}
          >
            Sessions as CSV
          </button>
        </div>
      </section>

      <section className="settings-card" aria-label="Account">
        <h2 className="settings-title">Account</h2>
        <div className="setting-row">
          <span className="setting-row-label">Signed in as</span>
          <span className="settings-note">{email}</span>
        </div>
        <div className="settings-actions">
          {isAdmin && onAdminPanel && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onAdminPanel}>
              Admin panel
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSignOut}>
            Sign out
          </button>
        </div>
        <p className="settings-note settings-about">
          GRIND v{APP_VERSION} · <a href="/">grind marketing site</a>
        </p>
      </section>
    </div>
  )
}
