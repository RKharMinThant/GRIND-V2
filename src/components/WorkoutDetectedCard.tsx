import { roundDurationToOptions } from '../health/logic'
import type { HealthWorkout } from '../health/types'
import { formatDuration } from '../lib/duration'

type Props = {
  workout: HealthWorkout
  /** Other unlogged workouts beyond this one */
  moreCount: number
  onLog: (workout: HealthWorkout) => void
  onDismiss: (id: string) => void
}

/** Home prompt: the tracker saw a workout that isn't in the journal yet. */
export function WorkoutDetectedCard({ workout, moreCount, onLog, onDismiss }: Props) {
  const d = roundDurationToOptions(workout.durationMin)
  const time = new Date(workout.start).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const facts = [
    time,
    formatDuration(d.hours, d.minutes),
    workout.calories != null ? `${workout.calories} kcal` : null,
    workout.avgHr != null ? `avg ${workout.avgHr} bpm` : null,
  ].filter(Boolean)

  return (
    <section className="list-group detect-card" aria-label="Workout detected by Fitbit">
      <div className="list-row detect-row">
        <span className="detect-icon" aria-hidden>
          <svg viewBox="0 0 24 24">
            <path d="M3 12h4l2-6 4 12 2-6h6" />
          </svg>
        </span>
        <div className="detect-card-copy list-row-label">
          <div className="detect-card-title">{workout.activity}</div>
          <div className="detect-card-facts">
            {[...facts, ...(moreCount > 0 ? [`+${moreCount} more`] : [])].join(' · ')}
          </div>
        </div>
        <button
          type="button"
          className="detect-dismiss"
          onClick={() => onDismiss(workout.id)}
          aria-label={`Dismiss ${workout.activity}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onLog(workout)}>
          Log
        </button>
      </div>
    </section>
  )
}
