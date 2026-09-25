// Turns a finished Fitbit exercise session into the notification text.
// Pure so the thresholds and copy are testable without a webhook or a phone.

import { personal } from './personal.ts'
import type { HealthWorkout } from './types.ts'

/** Below this, it is almost always Fitbit auto-detecting a walk — not worth a buzz,
 *  and not a training day for rest-day detection either. */
export const MIN_WORKOUT_MINUTES = 15
/**
 * Fitbit logs everyday walks as sessions too. A 30-minute walk home is not training:
 * counting it turned rest days into training days and would buzz after every stroll.
 * A treadmill INCLINE_WALK is a separate type and still counts.
 */
const NOT_TRAINING = new Set(['WALKING'])

/** A Fitbit session that counts as a workout, for notifications and rest-day detection. */
export function isTrainingSession(workout: HealthWorkout, minDurationMin = MIN_WORKOUT_MINUTES): boolean {
  if (!Number.isFinite(workout.durationMin) || workout.durationMin < minDurationMin) return false
  return !NOT_TRAINING.has(workout.exerciseType ?? '')
}

/** No notifications before this local hour; a 3am sync must not wake anyone. */
const QUIET_UNTIL_HOUR = 6

export type WorkoutNotification = {
  title: string
  body: string
  tag: string
  url: string
}

export function workoutNotification(
  workout: HealthWorkout,
  localHour: number,
  options: { minDurationMin?: number; name?: string | null } = {},
): WorkoutNotification | null {
  if (!isTrainingSession(workout, options.minDurationMin ?? MIN_WORKOUT_MINUTES)) return null
  if (localHour < QUIET_UNTIL_HOUR) return null

  const parts = [workout.activity?.trim() || 'Workout', `${Math.round(workout.durationMin)} min`]
  if (workout.calories != null) parts.push(`${Math.round(workout.calories)} cal`)
  if (workout.avgHr != null) parts.push(`avg ${Math.round(workout.avgHr)} bpm`)

  return {
    title: personal(options.name ?? null, (n) => `Nice work, ${n}`, 'Nice work'),
    body: `${parts.join(' · ')}. Tap to log it.`,
    // Per workout, so a second session tonight arrives as its own banner
    tag: `grind-workout-${workout.id}`,
    url: `/app?workout=${encodeURIComponent(workout.id)}`,
  }
}
