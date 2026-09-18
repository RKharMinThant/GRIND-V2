// Pure converters: Google Health API v4 DataPoints → GRIND's normalized health types.
// No Deno or network APIs here, so Vitest covers it from the app's test runner.

import type { DailySteps, HealthRecovery, HealthWorkout, SleepStages, ZoneMinutes } from './types.ts'

// deno-lint-ignore no-explicit-any
export type GDataPoint = Record<string, any>
// deno-lint-ignore no-explicit-any
export type GRollupPoint = Record<string, any>

type CivilDate = { year: number; month: number; day: number }

/** "3600s" → 3600 (protobuf Duration JSON). */
export function parseDurationSeconds(v: string | undefined | null): number | null {
  if (typeof v !== 'string') return null
  const m = /^(-?\d+(?:\.\d+)?)s$/.exec(v.trim())
  return m ? Number(m[1]) : null
}

/** int64 values arrive as strings. */
export function toInt(v: string | number | undefined | null): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export function civilDateString(d: CivilDate | undefined | null): string | null {
  if (!d?.year || !d.month || !d.day) return null
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}`
}

export function humanizeEnum(v: string): string {
  const s = v.toLowerCase().replace(/_/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function lastSegment(name: unknown): string {
  return typeof name === 'string' ? (name.split('/').pop() ?? name) : ''
}

const minutesOf = (duration: string | undefined) => {
  const s = parseDurationSeconds(duration)
  return s == null ? null : Math.round(s / 60)
}

export function normalizeExercise(dp: GDataPoint): HealthWorkout | null {
  const ex = dp.exercise
  const start: string | undefined = ex?.interval?.startTime
  if (!start) return null
  const end: string = ex.interval.endTime ?? start

  const active = parseDurationSeconds(ex.activeDuration)
  const durationMin =
    active != null
      ? Math.round(active / 60)
      : Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60_000))

  const metrics = ex.metricsSummary ?? {}
  const zones = metrics.heartRateZoneDurations
  const zoneMinutes: ZoneMinutes | null = zones
    ? {
        fatBurn: minutesOf(zones.moderateTime) ?? 0,
        cardio: minutesOf(zones.vigorousTime) ?? 0,
        peak: minutesOf(zones.peakTime) ?? 0,
      }
    : null

  const displayName = typeof ex.displayName === 'string' ? ex.displayName.trim() : ''

  return {
    id: lastSegment(dp.name),
    start,
    end,
    durationMin,
    activity: displayName || (ex.exerciseType ? humanizeEnum(ex.exerciseType) : 'Workout'),
    calories: toInt(metrics.caloriesKcal),
    avgHr: toInt(metrics.averageHeartRateBeatsPerMinute),
    // Not in metricsSummary
    maxHr: null,
    zoneMinutes,
  }
}

/** Local date the sleep ended: civil time when present, else endTime shifted by its UTC offset. */
function sleepEndDate(sleep: GDataPoint): string | null {
  const civil = civilDateString(sleep?.interval?.civilEndTime?.date)
  if (civil) return civil
  const end = sleep?.interval?.endTime
  if (!end) return null
  const offset = parseDurationSeconds(sleep.interval.endUtcOffset) ?? 0
  return new Date(Date.parse(end) + offset * 1000).toISOString().slice(0, 10)
}

const STAGE_MAP: Record<string, keyof SleepStages> = {
  DEEP: 'deep',
  LIGHT: 'light',
  ASLEEP: 'light',
  REM: 'rem',
  AWAKE: 'awake',
  RESTLESS: 'awake',
}

function stagesOf(summary: GDataPoint | undefined): SleepStages | null {
  const list = summary?.stagesSummary
  if (!Array.isArray(list) || list.length === 0) return null
  const out: SleepStages = { deep: 0, light: 0, rem: 0, awake: 0 }
  for (const s of list) {
    const key = STAGE_MAP[String(s?.type)]
    if (key) out[key] += toInt(s.minutes) ?? 0
  }
  return out
}

function addDaysIso(date: string, delta: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

function dailyValues(points: GDataPoint[], key: string, pick: (o: GDataPoint) => number | null) {
  const map = new Map<string, number>()
  for (const p of points) {
    const o = p?.[key]
    const date = civilDateString(o?.date)
    const v = o ? pick(o) : null
    if (date && v != null) map.set(date, v)
  }
  return map
}

function averageBefore(map: Map<string, number>, date: string): number | null {
  const vals: number[] = []
  for (let i = 1; i <= 7; i++) {
    const v = map.get(addDaysIso(date, -i))
    if (v != null) vals.push(v)
  }
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}

export function buildRecovery(
  date: string,
  sleep: GDataPoint[],
  rhr: GDataPoint[],
  hrv: GDataPoint[],
): HealthRecovery | null {
  // Prefer Fitbit's main sleep for the night, then the longest
  const main = sleep
    .map((p) => p?.sleep)
    .filter((s) => s && sleepEndDate(s) === date)
    .sort(
      (a, b) =>
        Number(b.metadata?.mainSleep === true) - Number(a.metadata?.mainSleep === true) ||
        (toInt(b.summary?.minutesAsleep) ?? 0) - (toInt(a.summary?.minutesAsleep) ?? 0),
    )[0]

  const rhrByDate = dailyValues(rhr, 'dailyRestingHeartRate', (o) => toInt(o.beatsPerMinute))
  const hrvByDate = dailyValues(hrv, 'dailyHeartRateVariability', (o) => {
    // Fitbit's HRV is RMSSD during deep sleep; fall back to whole-night figures
    const v =
      o.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds ??
      o.rootMeanSquareOfSuccessiveDifferencesMilliseconds ??
      o.averageHeartRateVariabilityMilliseconds
    return v == null ? null : Math.round(Number(v))
  })

  const sleepMin = main ? toInt(main.summary?.minutesAsleep) : null
  const restingHr = rhrByDate.get(date) ?? null
  const hrvMs = hrvByDate.get(date) ?? null
  if (sleepMin == null && restingHr == null && hrvMs == null) return null

  return {
    date,
    sleepMin,
    stages: main ? stagesOf(main.summary) : null,
    restingHr,
    restingHrAvg: averageBefore(rhrByDate, date),
    hrvMs,
    hrvAvg: averageBefore(hrvByDate, date),
  }
}

export function normalizeStepsRollup(points: GRollupPoint[]): DailySteps[] {
  const byDate = new Map<string, number>()
  for (const p of points) {
    const civil = p?.civilStartTime
    const date = civilDateString(civil?.date ?? civil)
    if (!date) continue
    byDate.set(date, toInt(p?.steps?.countSum) ?? 0)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, steps]) => ({ date, steps }))
}

/**
 * Main-sleep minutes keyed by the date each night ended.
 * Fitbit can report naps too, so prefer the night it flags as the main sleep.
 */
export function sleepMinutesByNight(sleep: GDataPoint[]): Map<string, number> {
  const byDate = new Map<string, { minutes: number; main: boolean }>()
  for (const p of sleep) {
    const s = p?.sleep
    const date = s ? sleepEndDate(s) : null
    const minutes = s ? toInt(s.summary?.minutesAsleep) : null
    if (!date || minutes == null) continue
    const main = s.metadata?.mainSleep === true
    const existing = byDate.get(date)
    if (!existing || (main && !existing.main) || (main === existing.main && minutes > existing.minutes)) {
      byDate.set(date, { minutes, main })
    }
  }
  return new Map([...byDate].map(([date, v]) => [date, v.minutes]))
}

/** Resting heart rate keyed by date. */
export function restingHeartRateByDate(rhr: GDataPoint[]): Map<string, number> {
  return dailyValues(rhr, 'dailyRestingHeartRate', (o) => toInt(o.beatsPerMinute))
}
