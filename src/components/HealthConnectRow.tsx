import { relativeSync } from '../health/logic'
import type { HealthState } from '../health/useHealth'

/** Fitbit connection controls for the profile menu. */
export function HealthConnectRow({ health }: { health: HealthState }) {
  const { connection, connecting, loading } = health
  const status = connection?.status ?? 'disconnected'
  const sourceLabel = health.source === 'demo' ? 'Demo data' : 'Google Health'

  return (
    <div className="health-row">
      <div className="health-row-head">
        <span className="health-row-title">
          <span className="health-dot" data-status={status} aria-hidden />
          Fitbit
        </span>
        {status === 'connected' && (
          <span className="health-row-meta">
            {sourceLabel} · Synced {relativeSync(connection?.lastSyncedAt ?? null)}
          </span>
        )}
        {status === 'expired' && <span className="health-row-meta warn">Connection expired</span>}
        {status === 'disconnected' && (
          <span className="health-row-meta">Workouts, sleep, heart rate and steps</span>
        )}
      </div>

      {status === 'connected' ? (
        <div className="health-row-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void health.sync()}
            disabled={loading}
          >
            {loading ? 'Syncing…' : 'Sync now'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void health.disconnect()}>
            Disconnect
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-sm btn-full"
          onClick={() => void health.connect()}
          disabled={connecting || !connection}
        >
          {connecting ? 'Connecting…' : status === 'expired' ? 'Reconnect' : 'Connect Fitbit'}
        </button>
      )}

      {health.error && <div className="health-row-error">{health.error}</div>}
    </div>
  )
}
