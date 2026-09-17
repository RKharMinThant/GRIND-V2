// Mirrors src/health/types.ts — the shapes the app expects from health-data.
// Edge Functions are bundled separately from the Vite app, so keep this copy in sync.

export type ZoneMinutes = { fatBurn: number; cardio: number; peak: number }

export type HealthWorkout = {
  id: string
  start: string
  end: string
  durationMin: number
  activity: string
  calories: number | null
  avgHr: number | null
  maxHr: number | null
  zoneMinutes: ZoneMinutes | null
}

export type SleepStages = { deep: number; light: number; rem: number; awake: number }

export type HealthRecovery = {
  date: string
  sleepMin: number | null
  stages: SleepStages | null
  restingHr: number | null
  restingHrAvg: number | null
  hrvMs: number | null
  hrvAvg: number | null
}

export type DailySteps = { date: string; steps: number }
