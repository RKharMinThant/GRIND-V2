import { meanDelta } from '../../health/bodyLogic'
import type { HealthState } from '../../health/useHealth'
import { useBodySection } from '../../health/useBodySection'
import { DayCurve } from '../charts/DayCurve'
import { Sparkline } from '../charts/Sparkline'
import { StackedBar } from '../charts/StackedBar'
import { SectionFrame } from './SectionFrame'

function Delta({ value, unit, lowerIsBetter }: { value: number | null; unit: string; lowerIsBetter?: boolean }) {
  if (value == null) return null
  if (value === 0) return <span className="rec-delta">= 30-day avg</span>
  const good = lowerIsBetter ? value < 0 : value > 0
  return (
    <span className={`rec-delta ${good ? 'good' : 'bad'}`}>
      {value > 0 ? '↑' : '↓'}
      {Math.abs(value)}
      {unit} vs 30-day avg
    </span>
  )
}

export function HeartSection({ health }: { health: HealthState }) {
  const { data, loading, error, retry } = useBodySection(health, 'heart')
  const rhr = data?.restingHr ?? []
  const hrv = data?.hrv ?? []
  const latestRhr = rhr[rhr.length - 1]
  const latestHrv = hrv[hrv.length - 1]
  const zones = data?.zonesToday
  const todayRange = data?.daily[data.daily.length - 1]
  const empty = !data || (!rhr.length && !hrv.length && !data.curveToday.length)

  return (
    <SectionFrame
      title="Heart"
      loading={loading}
      error={error}
      empty={empty}
      onRetry={retry}
      meta={todayRange ? <span className="body-section-note">Today {todayRange.min}–{todayRange.max} bpm</span> : null}
    >
      <div className="body-tiles">
        {latestRhr && (
          <div className="body-tile">
            <span className="label">Resting HR</span>
            <span className="body-tile-value">
              {latestRhr.bpm}
              <small> bpm</small>
            </span>
            <Delta value={meanDelta(rhr.map((d) => d.bpm))} unit="" lowerIsBetter />
            <Sparkline values={rhr.map((d) => d.bpm)} tone="danger" ariaLabel="Resting heart rate, last 30 days" />
          </div>
        )}
        {latestHrv && (
          <div className="body-tile">
            <span className="label">HRV</span>
            <span className="body-tile-value">
              {latestHrv.ms}
              <small> ms</small>
            </span>
            <Delta value={meanDelta(hrv.map((d) => d.ms))} unit=" ms" />
            <Sparkline values={hrv.map((d) => d.ms)} tone="ice" ariaLabel="Heart rate variability, last 30 days" />
          </div>
        )}
      </div>

      {data && data.curveToday.length > 1 && (
        <div className="body-block">
          <div className="body-block-title">Heart rate today</div>
          <DayCurve points={data.curveToday} ariaLabel="Heart rate across today in 5-minute averages" />
        </div>
      )}

      {zones && zones.moderate + zones.vigorous + zones.peak > 0 && (
        <div className="body-block">
          <div className="body-block-title">Time in heart-rate zones today</div>
          <StackedBar
            ariaLabel="Minutes in fat burn, cardio and peak zones today"
            parts={[
              { label: 'Fat burn', value: zones.moderate, tone: 'accent' },
              { label: 'Cardio', value: zones.vigorous, tone: 'ice' },
              { label: 'Peak', value: zones.peak, tone: 'danger' },
            ]}
          />
        </div>
      )}
    </SectionFrame>
  )
}
