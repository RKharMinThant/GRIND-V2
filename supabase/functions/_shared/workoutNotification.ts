// Turns a finished Fitbit exercise session into the notification text.
// Pure so the thresholds and copy are testable without a webhook or a phone.

import type { HealthWorkout } from './types.ts'

/** Below this, it is almost always Fitbit auto-detecting a walk — not worth a buzz. */
const MIN_DURATION_MIN = 15
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
  options: { minDurationMin?: number } = {},
): WorkoutNotification | null {
  const minimum = options.minDurationMin ?? MIN_DURATION_MIN
  if (!Number.isFinite(workout.durationMin) || workout.durationMin < minimum) return null
  if (localHour < QUIET_UNTIL_HOUR) return null

  const parts = [`${Math.round(workout.durationMin)} min`]
  if (workout.calories != null) parts.push(`${Math.round(workout.calories)} cal`)
  if (workout.avgHr != null) parts.push(`avg ${Math.round(workout.avgHr)} bpm`)

  return {
    title: workout.activity?.trim() || 'Workout logged',
    body: `${parts.join(' · ')} — tap to log the session.`,
    // Per workout, so a second session tonight arrives as its own banner
    tag: `grind-workout-${workout.id}`,
    url: `/app?workout=${encodeURIComponent(workout.id)}`,
  }
}
