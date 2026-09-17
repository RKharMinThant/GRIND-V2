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
    formatDuration(d.hours, d.minutes),
    workout.calories != null ? `${workout.calories} kcal` : null,
    workout.avgHr != null ? `avg ${workout.avgHr} bpm` : null,
  ].filter(Boolean)

  return (
    <section className="health-card detect-card" aria-label="Workout detected by Fitbit">
      <div className="health-card-kicker">
        <span className="health-dot" data-status="connected" aria-hidden />
        Fitbit detected · {time}
        {moreCount > 0 ? ` · +${moreCount} more` : ''}
      </div>
      <div className="detect-card-row">
        <div className="detect-card-copy">
          <div className="detect-card-title">{workout.activity}</div>
          <div className="detect-card-facts">{facts.join(' · ')}</div>
        </div>
        <div className="detect-card-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDismiss(workout.id)}>
            Dismiss
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onLog(workout)}>
            Log it
          </button>
        </div>
      </div>
    </section>
  )
}
