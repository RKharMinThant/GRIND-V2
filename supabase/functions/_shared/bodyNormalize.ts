// Pure converters for the Body tab: Google Health roll-ups and lists → normalized sections.
// Live responses are newest first; everything returned here is sorted oldest → newest.

import { civilDateString, type GDataPoint, type GRollupPoint, parseDurationSeconds, toInt } from './normalize.ts'
import type {
  DailyActivity,
  HeartSection,
  SleepNight,
  SleepSegment,
  SleepStages,
  TodaySummary,
  VitalsSection,
} from './types.ts'

const round1 = (n: number) => Math.round(n * 10) / 10

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Index daily roll-up points by their civil start date. */
function byDate(points: GRollupPoint[] | undefined): Map<string, GRollupPoint> {
  const map = new Map<string, GRollupPoint>()
  for (const p of points ?? []) {
    const date = civilDateString(p?.civilStartTime?.date)
    if (date) map.set(date, p)
  }
  return map
}

const stepsOf = (p?: GRollupPoint) => toInt(p?.steps?.countSum)
const kmOf = (p?: GRollupPoint) => {
  const mm = num(p?.distance?.millimetersSum)
  return mm == null ? null : round1(mm / 1_000_000)
}
const caloriesOf = (p?: GRollupPoint) => toInt(p?.totalCalories?.kcalSum)
const floorsOf = (p?: GRollupPoint) => toInt(p?.floors?.countSum)

function azmOf(p?: GRollupPoint): DailyActivity['azm'] {
  const a = p?.activeZoneMinutes
  if (!a) return null
  return {
    fatBurn: toInt(a.sumInFatBurnHeartZone) ?? 0,
    cardio: toInt(a.sumInCardioHeartZone) ?? 0,
    peak: toInt(a.sumInPeakHeartZone) ?? 0,
  }
}

function activeMinOf(p?: GRollupPoint): DailyActivity['activeMin'] {
  const list = p?.activeMinutes?.activeMinutesRollupByActivityLevel
  if (!Array.isArray(list)) return null
  const out = { light: 0, moderate: 0, vigorous: 0 }
  for (const item of list) {
    const key = String(item?.activityLevel ?? '').toLowerCase() as keyof typeof out
    if (key in out) out[key] = toInt(item.activeMinutesSum) ?? 0
  }
  return out
}

export function normalizeToday(
  date: string,
  r: { steps?: GRollupPoint[]; distance?: GRollupPoint[]; azm?: GRollupPoint[]; calories?: GRollupPoint[] },
): TodaySummary {
  const azm = azmOf(byDate(r.azm).get(date))
  return {
    date,
    steps: stepsOf(byDate(r.steps).get(date)),
    distanceKm: kmOf(byDate(r.distance).get(date)),
    zoneMinutes: azm ? azm.fatBurn + azm.cardio + azm.peak : null,
    calories: caloriesOf(byDate(r.calories).get(date)),
  }
}

export function normalizeActivity(r: {
  steps?: GRollupPoint[]
  distance?: GRollupPoint[]
  azm?: GRollupPoint[]
  activeMinutes?: GRollupPoint[]
  calories?: GRollupPoint[]
  floors?: GRollupPoint[]
}): DailyActivity[] {
  const maps = {
    steps: byDate(r.steps),
    distance: byDate(r.distance),
    azm: byDate(r.azm),
    activeMinutes: byDate(r.activeMinutes),
    calories: byDate(r.calories),
    floors: byDate(r.floors),
  }
  const dates = new Set<string>()
  for (const m of Object.values(maps)) for (const d of m.keys()) dates.add(d)
  return [...dates].sort().map((date) => ({
    date,
    steps: stepsOf(maps.steps.get(date)),
    distanceKm: kmOf(maps.distance.get(date)),
    azm: azmOf(maps.azm.get(date)),
    activeMin: activeMinOf(maps.activeMinutes.get(date)),
    calories: caloriesOf(maps.calories.get(date)),
    floors: floorsOf(maps.floors.get(date)),
  }))
}

function dailySeries<T>(points: GDataPoint[], key: string, pick: (o: GDataPoint) => T | null): (T & { date: string })[] {
  const map = new Map<string, T & { date: string }>()
  for (const p of points ?? []) {
    const o = p?.[key]
    const date = civilDateString(o?.date)
    const v = o ? pick(o) : null
    if (date && v != null) map.set(date, { date, ...v })
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function normalizeHeart(input: {
  rhr: GDataPoint[]
  hrv: GDataPoint[]
  daily: GRollupPoint[]
  zones: GRollupPoint[]
  curve: GRollupPoint[]
  dayStartIso: string
}): HeartSection {
  const restingHr = dailySeries(input.rhr, 'dailyRestingHeartRate', (o) => {
    const bpm = toInt(o.beatsPerMinute)
    return bpm == null ? null : { bpm }
  })
  const hrv = dailySeries(input.hrv, 'dailyHeartRateVariability', (o) => {
    const v = num(
      o.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds ??
        o.rootMeanSquareOfSuccessiveDifferencesMilliseconds ??
        o.averageHeartRateVariabilityMilliseconds,
    )
    return v == null ? null : { ms: Math.round(v) }
  })

  const daily = [...byDate(input.daily).entries()]
    .map(([date, p]) => {
      const h = p?.heartRate
      const min = toInt(h?.beatsPerMinuteMin)
      const avg = toInt(h?.beatsPerMinuteAvg)
      const max = toInt(h?.beatsPerMinuteMax)
      return min == null || avg == null || max == null ? null : { date, min, avg, max }
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .sort((a, b) => a.date.localeCompare(b.date))

  // Zones for the latest day present
  const zonePoint = [...byDate(input.zones).entries()].sort(([a], [b]) => b.localeCompare(a))[0]?.[1]
  const zoneList = zonePoint?.timeInHeartRateZone?.timeInHeartRateZones
  let zonesToday: HeartSection['zonesToday'] = null
  if (Array.isArray(zoneList)) {
    const zones = { light: 0, moderate: 0, vigorous: 0, peak: 0 }
    for (const z of zoneList) {
      const key = String(z?.heartRateZone ?? '').toLowerCase() as keyof typeof zones
      const s = parseDurationSeconds(z?.duration)
      if (key in zones && s != null) zones[key] = Math.round(s / 60)
    }
    zonesToday = zones
  }

  const dayStart = Date.parse(input.dayStartIso)
  const curveToday = (input.curve ?? [])
    .map((p) => {
      const t = Date.parse(p?.startTime)
      const bpm = toInt(p?.heartRate?.beatsPerMinuteAvg)
      if (!Number.isFinite(t) || bpm == null) return null
      const minute = Math.round((t - dayStart) / 60_000)
      return minute >= 0 && minute < 1440 ? { minute, bpm } : null
    })
    .filter((p): p is { minute: number; bpm: number } => p !== null)
    .sort((a, b) => a.minute - b.minute)

  return { restingHr, hrv, daily, zonesToday, curveToday }
}

const STAGE: Record<string, SleepSegment['stage']> = {
  AWAKE: 'awake',
  RESTLESS: 'awake',
  LIGHT: 'light',
  ASLEEP: 'light',
  DEEP: 'deep',
  REM: 'rem',
}

function localEndDate(interval: GDataPoint | undefined): string | null {
  const civil = civilDateString(interval?.civilEndTime?.date)
  if (civil) return civil
  const end = Date.parse(interval?.endTime)
  if (!Number.isFinite(end)) return null
  const offset = parseDurationSeconds(interval?.endUtcOffset) ?? 0
  return new Date(end + offset * 1000).toISOString().slice(0, 10)
}

function stageSummary(summary: GDataPoint | undefined): SleepStages | null {
  const list = summary?.stagesSummary
  if (!Array.isArray(list) || !list.length) return null
  const out: SleepStages = { deep: 0, light: 0, rem: 0, awake: 0 }
  for (const s of list) {
    const key = STAGE[String(s?.type)]
    if (key) out[key] += toInt(s.minutes) ?? 0
  }
  return out
}

export function normalizeSleepNights(points: GDataPoint[]): SleepNight[] {
  const best = new Map<string, GDataPoint>()
  for (const p of points ?? []) {
    const s = p?.sleep
    const date = localEndDate(s?.interval)
    if (!s || !date || !s.interval?.startTime) continue
    const current = best.get(date)
    const better =
      !current ||
      Number(s.metadata?.mainSleep === true) > Number(current.metadata?.mainSleep === true) ||
      (Boolean(s.metadata?.mainSleep) === Boolean(current.metadata?.mainSleep) &&
        (toInt(s.summary?.minutesAsleep) ?? 0) > (toInt(current.summary?.minutesAsleep) ?? 0))
    if (better) best.set(date, s)
  }

  return [...best.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, s]) => {
      const start = Date.parse(s.interval.startTime)
      const segments: SleepSegment[] = (Array.isArray(s.stages) ? s.stages : [])
        .map((st: GDataPoint) => {
          const stage = STAGE[String(st?.type)]
          const a = Date.parse(st?.startTime)
          const b = Date.parse(st?.endTime)
          if (!stage || !Number.isFinite(a) || !Number.isFinite(b)) return null
          return { stage, startMin: Math.round((a - start) / 60_000), endMin: Math.round((b - start) / 60_000) }
        })
        .filter((x: SleepSegment | null): x is SleepSegment => x !== null)
        .sort((x: SleepSegment, y: SleepSegment) => x.startMin - y.startMin)
      return {
        date,
        start: s.interval.startTime,
        end: s.interval.endTime,
        asleepMin: toInt(s.summary?.minutesAsleep),
        awakeMin: toInt(s.summary?.minutesAwake),
        toFallAsleepMin: toInt(s.summary?.minutesToFallAsleep),
        stages: stageSummary(s.summary),
        segments,
      }
    })
}

export function normalizeVitals(input: {
  spo2: GDataPoint[]
  breathing: GDataPoint[]
  temp: GDataPoint[]
  weight: GDataPoint[]
}): VitalsSection {
  const spo2 = dailySeries(input.spo2, 'dailyOxygenSaturation', (o) => {
    const avg = num(o.averagePercentage)
    if (avg == null) return null
    const low = num(o.lowerBoundPercentage)
    const high = num(o.upperBoundPercentage)
    return { avg: round1(avg), low: low == null ? null : round1(low), high: high == null ? null : round1(high) }
  })
  const breathing = dailySeries(input.breathing, 'dailyRespiratoryRate', (o) => {
    const bpm = num(o.breathsPerMinute)
    return bpm == null ? null : { bpm: round1(bpm) }
  })
  const skinTemp = dailySeries(input.temp, 'dailySleepTemperatureDerivations', (o) => {
    const nightly = num(o.nightlyTemperatureCelsius)
    const baseline = num(o.baselineTemperatureCelsius)
    return nightly == null || baseline == null ? null : { deltaC: round1(nightly - baseline) || 0 }
  })

  const weightByDate = new Map<string, number>()
  for (const p of input.weight ?? []) {
    const date = civilDateString(p?.weight?.sampleTime?.civilTime?.date)
    const grams = num(p?.weight?.weightGrams)
    if (date && grams != null) weightByDate.set(date, round1(grams / 1000))
  }
  const weight = [...weightByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, kg]) => ({ date, kg }))

  return { spo2, breathing, skinTemp, weight }
}
