import { useState } from 'react'
import { friendlyDateShort } from '../../lib/dates'

type Day = { date: string; steps: number | null }

type Props = {
  /** Oldest → newest; null entries render as empty slots */
  days: (Day | null)[]
  goal: number
}

/** Daily step bars with a dashed goal line. Tap a bar to see its value. */
export function StepBars({ days, goal }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const max = Math.max(goal * 1.15, ...days.map((d) => d?.steps ?? 0))
  const goalPct = (goal / max) * 100
  const active = selected ?? days.length - 1
  const activeDay = days[active]
  const hits = days.filter((d) => d?.steps != null && d.steps >= goal).length
  const dense = days.length > 10

  return (
    <div className="step-bars">
      <div className="chart-readout" aria-live="polite">
        <span className="chart-readout-value">{activeDay?.steps != null ? activeDay.steps.toLocaleString() : '—'}</span>
        <span className="chart-readout-meta">
          {activeDay ? friendlyDateShort(activeDay.date) : ''} · goal hit {hits} of {days.length} days
        </span>
      </div>
      <div className={`step-bars-plot${dense ? ' dense' : ''}`}>
        <div className="step-bars-goal" style={{ bottom: `${goalPct}%` }}>
          <span>{goal >= 1000 ? `${Math.round(goal / 100) / 10}k` : goal}</span>
        </div>
        {days.map((d, i) => {
          const h = d?.steps ? Math.max(2, (d.steps / max) * 100) : 0
          const hit = d?.steps != null && d.steps >= goal
          return (
            <button
              key={d?.date ?? i}
              type="button"
              className={`step-bar${hit ? ' hit' : ''}${i === active ? ' active' : ''}`}
              onClick={() => setSelected(i)}
              aria-label={d ? `${friendlyDateShort(d.date)}: ${d.steps?.toLocaleString() ?? 'no data'} steps` : 'No data'}
            >
              <span className="step-bar-fill" style={{ height: `${h}%`, ['--i' as string]: i }} />
            </button>
          )
        })}
      </div>
      {!dense && (
        <div className="step-bars-axis" aria-hidden>
          {days.map((d, i) => (
            <span key={d?.date ?? i}>
              {d ? new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' }) : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
