import { relativeSync } from '../health/logic'
import type { HealthState } from '../health/useHealth'
import { ActivitySection } from './body/ActivitySection'
import { HeartSection } from './body/HeartSection'
import { SleepSection } from './body/SleepSection'
import { VitalsSection } from './body/VitalsSection'

type Props = {
  health: HealthState
  stepGoal: number
}

/** Fitbit Body tab: activity, heart, sleep and night vitals. */
export function BodyView({ health, stepGoal }: Props) {
  const status = health.connection?.status

  return (
    <div className="page body-page">
      <div className="page-header">
        <div>
          <div className="page-title">Body</div>
          {status === 'connected' && (
            <div className="body-synced">
              {health.source === 'demo' ? 'Demo data · ' : ''}Synced {relativeSync(health.connection?.lastSyncedAt ?? null)}
            </div>
          )}
        </div>
        {status === 'connected' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void health.sync()} disabled={health.loading}>
            {health.loading ? 'Syncing…' : 'Sync'}
          </button>
        )}
      </div>

      {!health.connection ? (
        <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '30vh' }}>
          <div className="spinner" />
        </div>
      ) : status !== 'connected' ? (
        <section className="health-card body-connect">
          <div className="body-connect-mark" aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d="M3 12h4l2-6 4 12 2-6h6" />
            </svg>
          </div>
          <h2>{status === 'expired' ? 'Reconnect Fitbit' : 'Connect Fitbit'}</h2>
          <p>
            {status === 'expired'
              ? 'Your Fitbit connection expired. Reconnect to keep your activity, heart, sleep and vitals up to date.'
              : 'See your steps, heart rate, sleep stages and night vitals next to your training.'}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => void health.connect()} disabled={health.connecting}>
            {health.connecting ? 'Connecting…' : status === 'expired' ? 'Reconnect' : 'Connect Fitbit'}
          </button>
          {health.error && <p className="health-row-error">{health.error}</p>}
        </section>
      ) : (
        <>
          <ActivitySection health={health} stepGoal={stepGoal} />
          <HeartSection health={health} />
          <SleepSection health={health} />
          <VitalsSection health={health} />
          <p className="rec-foot body-foot">Estimates from your tracker, not medical advice.</p>
        </>
      )}
    </div>
  )
}
