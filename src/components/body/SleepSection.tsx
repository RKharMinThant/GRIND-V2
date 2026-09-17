import { useState } from 'react'
import { formatClock } from '../../health/bodyLogic'
import { formatSleep } from '../../health/logic'
import type { HealthState } from '../../health/useHealth'
import { useBodySection } from '../../health/useBodySection'
import { friendlyDateShort } from '../../lib/dates'
import { Hypnogram } from '../charts/Hypnogram'
import { StackedBar } from '../charts/StackedBar'
import { SectionFrame } from './SectionFrame'

export function SleepSection({ health }: { health: HealthState }) {
  const { data, loading, error, retry } = useBodySection(health, 'sleep')
  const nights = data?.nights ?? []
  const [picked, setPicked] = useState<string | null>(null)
  const night = nights.find((n) => n.date === picked) ?? nights[nights.length - 1]
  const maxAsleep = Math.max(1, ...nights.map((n) => n.asleepMin ?? 0))

  return (
    <SectionFrame
      title="Sleep"
      loading={loading}
      error={error}
      empty={!nights.length}
      onRetry={retry}
      meta={<span className="body-section-note">{nights.length} nights</span>}
    >
      <div className="sleep-nights" role="group" aria-label="Choose a night">
        {nights.map((n) => {
          const selected = n.date === night?.date
          return (
            <button
              key={n.date}
              type="button"
              className={`sleep-night${selected ? ' active' : ''}`}
              onClick={() => setPicked(n.date)}
              aria-pressed={selected}
              aria-label={`${friendlyDateShort(n.date)}: ${n.asleepMin != null ? formatSleep(n.asleepMin) : 'no data'}`}
            >
              <span className="sleep-night-bar" style={{ height: `${((n.asleepMin ?? 0) / maxAsleep) * 100}%` }} />
            </button>
          )
        })}
      </div>

      {night && (
        <>
          <div className="chart-readout">
            <span className="chart-readout-value">{night.asleepMin != null ? formatSleep(night.asleepMin) : '—'}</span>
            <span className="chart-readout-meta">
              {friendlyDateShort(night.date)} · {formatClock(night.start)} → {formatClock(night.end)}
            </span>
          </div>
          <Hypnogram night={night} />
          <div className="body-stats">
            <div>
              <span className="label">Fell asleep in</span>
              <span className="body-stat-value">{night.toFallAsleepMin != null ? `${night.toFallAsleepMin} min` : '—'}</span>
            </div>
            <div>
              <span className="label">Awake</span>
              <span className="body-stat-value">{night.awakeMin != null ? `${night.awakeMin} min` : '—'}</span>
            </div>
            <div>
              <span className="label">Deep + REM</span>
              <span className="body-stat-value">{night.stages ? formatSleep(night.stages.deep + night.stages.rem) : '—'}</span>
            </div>
          </div>
          {night.stages && (
            <StackedBar
              ariaLabel="Minutes in each sleep stage"
              parts={[
                { label: 'Deep', value: night.stages.deep, tone: 'ice' },
                { label: 'REM', value: night.stages.rem, tone: 'rem' },
                { label: 'Light', value: night.stages.light, tone: 'ice-soft' },
                { label: 'Awake', value: night.stages.awake, tone: 'danger' },
              ]}
            />
          )}
        </>
      )}
    </SectionFrame>
  )
}
