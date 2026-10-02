import { formatSleep, readiness } from '../health/logic'
import { deltaVsBaseline, readinessView, ZONE_INFO } from '../health/readiness'
import type { HealthRecovery, ReadinessScore } from '../health/types'
import { Ring } from './charts/Ring'

type Props = {
  recovery: HealthRecovery | null
  readiness: ReadinessScore | null
  error: string | null
  onRetry: () => void
}

function Delta({
  value,
  baseline,
  fallback,
  lowerIsBetter,
}: {
  value: number | null
  /** The 30-day normal from readiness, when there is one */
  baseline: number | null | undefined
  /** The 7-day average, used when there is no 30-day normal */
  fallback: number | null
  lowerIsBetter?: boolean
}) {
  const has30 = baseline != null
  const diff = deltaVsBaseline(value, has30 ? baseline : fallback)
  if (diff == null) return null
  const label = has30 ? '30-day normal' : '7-day'
  if (diff === 0) return <span className="rec-delta">Same as {label}</span>
  const good = lowerIsBetter ? diff < 0 : diff > 0
  return (
    <span className={`rec-delta ${good ? 'good' : 'bad'}`}>
      {diff > 0 ? '↑' : '↓'}
      {Math.abs(diff)} vs {label}
    </span>
  )
}

const STAGE_ORDER = ['deep', 'rem', 'light', 'awake'] as const

const ZONE_TONE = { green: 'accent', yellow: 'warn', red: 'danger' } as const

/** Last night's readiness score, sleep, resting HR and HRV — informs, never prescribes. */
export function RecoveryCard({ recovery, readiness: score, error, onRetry }: Props) {
  if (error) {
    return (
      <section aria-label="Recovery">
        <div className="section-header">
          <h2>Readiness</h2>
        </div>
        <div className="card rec-card--error">
          <span>
            Couldn't reach Fitbit
            <small>{error}</small>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
            Retry
          </button>
        </div>
      </section>
    )
  }
  if (!recovery) return null

  const view = readinessView(score)
  // Older cached data has no readiness: keep the simple hint (text only)
  const state = score ? 'unknown' : readiness(recovery)
  const s = recovery.stages
  const stageTotal = s ? s.deep + s.light + s.rem + s.awake : 0

  return (
    <section aria-label="Recovery">
      <div className="section-header">
        <h2>Readiness</h2>
        <span className="section-header-note">Last night</span>
      </div>
      <div className="card rec-card">
        {view.kind === 'building' && (
          <p className="readiness readiness--building">
            Building your baseline — readiness needs about a week of data ({view.days}{' '}
            {view.days === 1 ? 'day' : 'days'} so far)
          </p>
        )}
        {view.kind === 'score' && (
          <div className={`readiness ${view.zone}`}>
            <Ring
              progress={view.score / 100}
              size={88}
              tone={ZONE_TONE[view.zone]}
              label={String(view.score)}
              ariaLabel={`Readiness ${view.score} out of 100, ${ZONE_INFO[view.zone].word.toLowerCase()} zone`}
            />
            <div className="readiness-copy">
              <div className="readiness-zone">{ZONE_INFO[view.zone].word}</div>
              <p className="readiness-line">{ZONE_INFO[view.zone].line}</p>
            </div>
          </div>
        )}
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
          <div className="rec-tile rec-tile--heart">
            <div className="label">Resting HR</div>
            <div className="rec-num">
              {recovery.restingHr ?? '—'}
              {recovery.restingHr != null && <small>bpm</small>}
            </div>
            <Delta
              value={recovery.restingHr}
              baseline={score?.restingHr.baseline}
              fallback={recovery.restingHrAvg}
              lowerIsBetter
            />
          </div>
          <div className="rec-tile rec-tile--heart">
            <div className="label">HRV</div>
            <div className="rec-num">
              {recovery.hrvMs ?? '—'}
              {recovery.hrvMs != null && <small>ms</small>}
            </div>
            <Delta value={recovery.hrvMs} baseline={score?.hrv.baseline} fallback={recovery.hrvAvg} />
          </div>
        </div>

        {state !== 'unknown' && (
          <div className={`rec-hint ${state}`}>
            {state === 'low' ? 'Recovery looks low — take it easy today.' : 'Recovered — good day to train.'}
          </div>
        )}
        <p className="rec-foot">Estimates from your tracker, not medical advice.</p>
      </div>
    </section>
  )
}
