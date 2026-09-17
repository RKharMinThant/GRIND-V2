/** Normalized health data — the only shapes the UI sees, whatever the provider. */

export type HealthSource = 'demo' | 'google_health'

export type ZoneMinutes = { fatBurn: number; cardio: number; peak: number }

export type HealthWorkout = {
  /** Provider workout id; stored as logs.health_workout_id */
  id: string
  start: string
  end: string
  durationMin: number
  /** e.g. "Weights", "Run", "Walk" */
  activity: string
  calories: number | null
  avgHr: number | null
  maxHr: number | null
  zoneMinutes: ZoneMinutes | null
}

/** Minutes per sleep stage */
export type SleepStages = { deep: number; light: number; rem: number; awake: number }

export type HealthRecovery = {
  /** Local date the night ended (YYYY-MM-DD) */
  date: string
  sleepMin: number | null
  stages: SleepStages | null
  restingHr: number | null
  /** 7-day average */
  restingHrAvg: number | null
  hrvMs: number | null
  /** 7-day average */
  hrvAvg: number | null
}

export type DailySteps = { date: string; steps: number }

export type HealthConnection = {
  status: 'disconnected' | 'connected' | 'expired'
  lastSyncedAt: string | null
  source: HealthSource
}

/** Workout stats saved onto a session log (migration 013). */
export type LogHealthFields = {
  health_source: HealthSource | null
  health_workout_id: string | null
  calories_kcal: number | null
  avg_hr: number | null
  max_hr: number | null
  hr_zone_minutes: ZoneMinutes | null
}

export const EMPTY_HEALTH_FIELDS: LogHealthFields = {
  health_source: null,
  health_workout_id: null,
  calories_kcal: null,
  avg_hr: null,
  max_hr: null,
  hr_zone_minutes: null,
}
