import { formatSleep, readiness } from '../health/logic'
import type { HealthRecovery } from '../health/types'

type Props = {
  recovery: HealthRecovery | null
  restLoggedToday: boolean
  restBusy: boolean
  onRestDay: () => void
  error: string | null
  onRetry: () => void
}

function Delta({
  value,
  avg,
  lowerIsBetter,
}: {
  value: number | null
  avg: number | null
  lowerIsBetter?: boolean
}) {
  if (value == null || avg == null) return null
  const diff = Math.round(value - avg)
  if (diff === 0) return <span className="rec-delta">= 7-day avg</span>
  const good = lowerIsBetter ? diff < 0 : diff > 0
  return (
    <span className={`rec-delta ${good ? 'good' : 'bad'}`}>
      {diff > 0 ? '↑' : '↓'}
      {Math.abs(diff)} vs 7-day
    </span>
  )
}

const STAGE_ORDER = ['deep', 'rem', 'light', 'awake'] as const

/** Last night's sleep, resting HR and HRV with a simple train/rest hint. */
export function RecoveryCard({ recovery, restLoggedToday, restBusy, onRestDay, error, onRetry }: Props) {
  if (error) {
    return (
      <section className="health-card rec-card--error" aria-label="Recovery">
        <span>
          Couldn't reach Fitbit
          <small>{error}</small>
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
          Retry
        </button>
      </section>
    )
  }
  if (!recovery) return null

  const state = readiness(recovery)
  const s = recovery.stages
  const stageTotal = s ? s.deep + s.light + s.rem + s.awake : 0

  return (
    <section className="health-card rec-card" aria-label="Recovery">
      <div className="health-card-kicker">Recovery · last night</div>
      <div className="rec-grid">
        <div className="rec-tile rec-tile--sleep">
          <div className="label">Sleep</div>
          <div className="rec-num">{recovery.sleepMin != null ? formatSleep(recovery.sleepMin) : '—'}</div>
          {s && stageTotal > 0 && (
            <>
              <div
                className="sleep-bar"
                role="img"
                aria-label={`Deep ${s.deep} min, REM ${s.rem} min, light ${s.light} min, awake ${s.awake} min`}
              >
                {STAGE_ORDER.map((k) => (
                  <span key={k} className={`sleep-seg ${k}`} style={{ width: `${(s[k] / stageTotal) * 100}%` }} />
                ))}
              </div>
              <div className="sleep-legend" aria-hidden>
                <span className="deep">Deep {formatSleep(s.deep)}</span>
                <span className="rem">REM {formatSleep(s.rem)}</span>
              </div>
            </>
          )}
        </div>
        <div className="rec-tile">
          <div className="label">Resting HR</div>
          <div className="rec-num">
            {recovery.restingHr ?? '—'}
            {recovery.restingHr != null && <small> bpm</small>}
          </div>
          <Delta value={recovery.restingHr} avg={recovery.restingHrAvg} lowerIsBetter />
        </div>
        <div className="rec-tile">
          <div className="label">HRV</div>
          <div className="rec-num">
            {recovery.hrvMs ?? '—'}
            {recovery.hrvMs != null && <small> ms</small>}
          </div>
          <Delta value={recovery.hrvMs} avg={recovery.hrvAvg} />
        </div>
      </div>

      {state !== 'unknown' && (
        <div className={`rec-hint ${state}`}>
          <span>
            {state === 'low'
              ? 'Recovery looks low — a rest day might pay off.'
              : 'Recovered — good day to train.'}
          </span>
          {state === 'low' && (
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-rest"
              onClick={onRestDay}
              disabled={restBusy || restLoggedToday}
            >
              {restLoggedToday ? 'Rest logged' : restBusy ? 'Logging…' : 'Rest day'}
            </button>
          )}
        </div>
      )}
      <p className="rec-foot">Estimates from your tracker, not medical advice.</p>
    </section>
  )
}
