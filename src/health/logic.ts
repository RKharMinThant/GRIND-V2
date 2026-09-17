import { addDays, toLocalDateString } from '../lib/dates'
import type { WorkoutType } from '../types/database'
import type { HealthRecovery, HealthSource, HealthWorkout, LogHealthFields } from './types'

export type Readiness = 'low' | 'good' | 'unknown'

/** Simple train/rest hint from last night's recovery (spec §6.1). */
export function readiness(r: HealthRecovery | null): Readiness {
  if (!r || (r.sleepMin == null && r.restingHr == null && r.hrvMs == null)) return 'unknown'
  if (r.sleepMin != null && r.sleepMin < 360) return 'low'
  if (r.hrvMs != null && r.hrvAvg != null && r.hrvMs < 0.85 * r.hrvAvg) return 'low'
  if (r.restingHr != null && r.restingHrAvg != null && r.restingHr > r.restingHrAvg + 5) return 'low'
  return 'good'
}

// Order matters: HIIT before Cardio so "Interval run" is HIIT.
const TYPE_RULES: [RegExp, WorkoutType][] = [
  [/weight|strength|lift/i, 'Strength'],
  [/hiit|interval|circuit/i, 'HIIT'],
  [/yoga|pilates|stretch/i, 'Flexibility'],
  [/swim/i, 'Swim'],
  [/bike|cycl|spin/i, 'Cycle'],
  [/run|walk|hike|elliptical|treadmill/i, 'Cardio'],
]

export function activityToWorkoutType(activity: string): WorkoutType {
  return TYPE_RULES.find(([re]) => re.test(activity))?.[1] ?? 'Other'
}

export function stepTier(steps: number): '' | 'l1' | 'l2' | 'l3' {
  if (steps >= 12000) return 'l3'
  if (steps >= 8000) return 'l2'
  if (steps >= 5000) return 'l1'
  return ''
}

export function workoutLocalDate(w: Pick<HealthWorkout, 'start'>): string {
  return toLocalDateString(new Date(w.start))
}

/** Workouts from today/yesterday not yet linked to a log or dismissed — newest first. */
export function unlinkedWorkouts(
  workouts: HealthWorkout[],
  logs: { health_workout_id?: string | null }[],
  dismissedIds: string[],
  today: string,
): HealthWorkout[] {
  const linked = new Set(logs.map((l) => l.health_workout_id).filter(Boolean))
  const dismissed = new Set(dismissedIds)
  const yesterday = addDays(today, -1)
  return workouts
    .filter((w) => !linked.has(w.id) && !dismissed.has(w.id))
    .filter((w) => {
      const d = workoutLocalDate(w)
      return d === today || d === yesterday
    })
    .sort((a, b) => b.start.localeCompare(a.start))
}

/** Round to the log form's 5-minute options, capped at 12h 55m. */
export function roundDurationToOptions(min: number): { hours: number; minutes: number } {
  const total = Math.min(12 * 60 + 55, Math.max(0, Math.round(min / 5) * 5))
  return { hours: Math.floor(total / 60), minutes: total % 60 }
}

export function workoutToHealthFields(w: HealthWorkout, source: HealthSource): LogHealthFields {
  return {
    health_source: source,
    health_workout_id: w.id,
    calories_kcal: w.calories,
    avg_hr: w.avgHr,
    max_hr: w.maxHr,
    hr_zone_minutes: w.zoneMinutes,
  }
}

export function pickHealthFields(log: Partial<LogHealthFields>): LogHealthFields {
  return {
    health_source: log.health_source ?? null,
    health_workout_id: log.health_workout_id ?? null,
    calories_kcal: log.calories_kcal ?? null,
    avg_hr: log.avg_hr ?? null,
    max_hr: log.max_hr ?? null,
    hr_zone_minutes: log.hr_zone_minutes ?? null,
  }
}

export function formatSleep(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

export function relativeSync(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'never'
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.floor(hours / 24)} d ago`
}
