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
  /** Google's exercise type (e.g. WALKING, STRENGTH_TRAINING). Server-side only. */
  exerciseType?: string | null
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

// ── Body tab (spec 2026-09-17-fitbit-body-tab-design.md §4) ────────────────

export type TodaySummary = {
  date: string
  steps: number | null
  distanceKm: number | null
  zoneMinutes: number | null
  calories: number | null
}

export type DailyActivity = {
  date: string
  steps: number | null
  distanceKm: number | null
  azm: { fatBurn: number; cardio: number; peak: number } | null
  activeMin: { light: number; moderate: number; vigorous: number } | null
  calories: number | null
  floors: number | null
}

export type HeartSection = {
  restingHr: { date: string; bpm: number }[]
  hrv: { date: string; ms: number }[]
  daily: { date: string; min: number; avg: number; max: number }[]
  zonesToday: { light: number; moderate: number; vigorous: number; peak: number } | null
  curveToday: { minute: number; bpm: number }[]
}

export type SleepSegment = { stage: 'awake' | 'light' | 'deep' | 'rem'; startMin: number; endMin: number }

export type SleepNight = {
  date: string
  start: string
  end: string
  asleepMin: number | null
  awakeMin: number | null
  toFallAsleepMin: number | null
  stages: SleepStages | null
  segments: SleepSegment[]
}

export type SleepSection = { nights: SleepNight[] }

export type VitalsSection = {
  spo2: { date: string; avg: number; low: number | null; high: number | null }[]
  breathing: { date: string; bpm: number }[]
  skinTemp: { date: string; deltaC: number }[]
  weight: { date: string; kg: number }[]
}

export type BodySectionId = 'activity' | 'heart' | 'sleep' | 'vitals'

export type BodySectionData = {
  activity: DailyActivity[]
  heart: HeartSection
  sleep: SleepSection
  vitals: VitalsSection
}

// ── Daily readiness (0–100) — computed on the server, shown on Home and in the
// morning notification. Mirrored between supabase/functions/_shared/types.ts and
// src/health/types.ts.
export type ReadinessZone = 'green' | 'yellow' | 'red'

export type ReadinessComponent = {
  /** Last night's value (HRV ms, resting HR bpm, minutes asleep) */
  value: number | null
  /** 30-day personal mean for HRV / resting HR; the 450-min need for sleep */
  baseline: number | null
  /** 0–100 */
  score: number | null
}

export type ReadinessScore = {
  /** Local date the night ended (YYYY-MM-DD) */
  date: string
  /** 'building' until there are ≥7 days of HRV or resting-HR history */
  status: 'ok' | 'building'
  /** 0–100, null when building or when last night has no HRV and no resting HR */
  score: number | null
  zone: ReadinessZone | null
  hrv: ReadinessComponent
  restingHr: ReadinessComponent
  sleep: ReadinessComponent
  /** Days of history behind the baselines (max 30) */
  baselineDays: number
}
