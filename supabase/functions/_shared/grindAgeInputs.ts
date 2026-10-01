// Gathers everything GRIND Age needs for one user: the profile baseline, Google Health
// reads (sleep, steps, zones, strength, resting heart rate, height) and the latest
// typed-in body measurement. The Google reads run in parallel and fail independently —
// one slow or broken data type leaves that input null instead of sinking the whole score.
//
// The maths below the Google calls is pure (no I/O) so it can be tested on its own.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { normalizeActivity, normalizeSleepNights } from './bodyNormalize.ts'
import { dailyRollUpRange, FILTERS, listAll } from './googleApi.ts'
import type { GrindAgeInputs, Sex } from './grindAgeTypes.ts'
import { localParts } from './localTime.ts'
import { normalizeExercise, restingHeartRateByDate } from './normalize.ts'
import type { HealthWorkout } from './types.ts'

/** Fewest nights / days a window needs before its average means anything. */
const MIN_SLEEP_NIGHTS = 5
const MIN_DAYS = 7
const STRENGTH_TYPES = new Set(['STRENGTH_TRAINING', 'WEIGHTLIFTING'])
const BODY_MAX_AGE_DAYS = 60

export const addDays = (date: string, delta: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10)

/** The Monday on or before a YYYY-MM-DD date. */
export function weekStartOf(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(day, -((dow + 6) % 7))
}

/** Years with decimals from birth date to a day, both YYYY-MM-DD. */
export function ageInYears(birthDate: string, today: string): number {
  return (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${birthDate}T00:00:00Z`)) / (365.25 * 86_400_000)
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

/** Population standard deviation. */
function sd(values: number[]): number {
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

const minuteFormatters = new Map<string, Intl.DateTimeFormat>()

/** Minutes since local midnight for an instant, on the clock of `timeZone`. */
export function minutesOfDay(iso: string, timeZone: string): number | null {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  let formatter = minuteFormatters.get(timeZone)
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false })
    } catch {
      return minutesOfDay(iso, 'UTC')
    }
    minuteFormatters.set(timeZone, formatter)
  }
  const parts: Record<string, string> = {}
  for (const p of formatter.formatToParts(at)) parts[p.type] = p.value
  // hour12:false yields "24" at midnight in some locales
  return (Number(parts.hour) % 24) * 60 + Number(parts.minute)
}

/**
 * Bedtime and wake-time variability: the mean of the two standard deviations, in minutes.
 * Bedtimes before noon are shifted a day later, so 23:30 and 00:30 are an hour apart
 * rather than 23 hours.
 */
export function sleepConsistency(nights: { start: string; end: string }[], timeZone: string): number | null {
  const bed: number[] = []
  const wake: number[] = []
  for (const n of nights) {
    const b = minutesOfDay(n.start, timeZone)
    const w = minutesOfDay(n.end, timeZone)
    if (b == null || w == null) continue
    bed.push(b < 720 ? b + 1440 : b)
    wake.push(w)
  }
  if (bed.length < MIN_SLEEP_NIGHTS) return null
  return (sd(bed) + sd(wake)) / 2
}

/** Runs one input's read; a failure is logged, recorded in `failed`, and becomes null. */
async function attempt<T>(label: string, read: () => Promise<T>, failed: string[]): Promise<T | null> {
  try {
    return await read()
  } catch (e) {
    console.error(`grind-age ${label} failed`, (e as Error).message)
    failed.push(label)
    return null
  }
}

async function readSleep(token: string, today: string, timeZone: string) {
  const points = await listAll(token, 'sleep', FILTERS.sleep(addDays(today, -15)))
  const nights = normalizeSleepNights(points)
  const asleep = nights.map((n) => n.asleepMin).filter((m): m is number => m != null)
  return {
    sleepHours: asleep.length >= MIN_SLEEP_NIGHTS ? mean(asleep) / 60 : null,
    sleepConsistencyMin: sleepConsistency(nights, timeZone),
  }
}

async function readActivity(token: string, today: string) {
  // Complete days only: today's partial count would drag the average down
  const from = addDays(today, -30)
  const to = addDays(today, -1)
  const [steps, azm] = await Promise.all([
    dailyRollUpRange(token, 'steps', from, to),
    dailyRollUpRange(token, 'active-zone-minutes', from, to),
  ])
  const days = normalizeActivity({ steps, azm })

  const stepDays = days.map((d) => d.steps).filter((s): s is number => s != null && s > 0)
  const zoneDays = days.filter((d) => d.azm != null)
  const enough = zoneDays.length >= MIN_DAYS
  const perWeek = (pick: (a: NonNullable<(typeof zoneDays)[number]['azm']>) => number) =>
    enough ? (zoneDays.reduce((sum, d) => sum + pick(d.azm!), 0) / zoneDays.length) * 7 : null

  return {
    dailySteps: stepDays.length >= MIN_DAYS ? mean(stepDays) : null,
    lowerZoneMinPerWeek: perWeek((a) => a.fatBurn),
    higherZoneMinPerWeek: perWeek((a) => a.cardio + a.peak),
  }
}

/** Strength minutes per week over the 30 days ending `today`; sessions of other types don't count. */
export function strengthMinutesPerWeek(workouts: HealthWorkout[], today: string, timeZone: string): number {
  const since = addDays(today, -29) // today and the 29 days before it: 30 days
  const minutes = workouts
    .filter((w) => w.exerciseType != null && STRENGTH_TYPES.has(w.exerciseType))
    // The day it finished, on the user's own clock
    .filter((w) => localParts(new Date(w.end), timeZone).day >= since)
    .reduce((sum, w) => sum + w.durationMin, 0)
  return (minutes / 30) * 7
}

/** null when Google returned no sessions at all: that is unknown, not zero. */
async function readStrength(token: string, today: string, timeZone: string): Promise<number | null> {
  const points = await listAll(token, 'exercise', FILTERS.exercise(addDays(today, -31)))
  if (points.length === 0) return null
  const workouts = points.map(normalizeExercise).filter((w): w is HealthWorkout => w !== null)
  return strengthMinutesPerWeek(workouts, today, timeZone)
}

async function readRestingHr(token: string, today: string): Promise<number | null> {
  const points = await listAll(token, 'daily-resting-heart-rate', FILTERS.dailyRestingHeartRate(addDays(today, -30)))
  const values = [...restingHeartRateByDate(points).values()]
  return values.length >= MIN_DAYS ? mean(values) : null
}

async function readHeightM(token: string): Promise<number | null> {
  const points = await listAll(token, 'height', FILTERS.height('2000-01-01'))
  // Newest sample wins. Responses come newest first, so a missing time keeps the earlier point.
  let best: { key: string; mm: number } | null = null
  for (const p of points) {
    const mm = Number(p?.height?.heightMillimeters)
    if (!Number.isFinite(mm) || mm <= 0) continue
    const t = p.height.sampleTime
    const key = String(t?.physicalTime ?? t?.civilTime?.date ?? '')
    if (!best || key > best.key) best = { key, mm }
  }
  return best ? best.mm / 1000 : null
}

async function readBody(db: SupabaseClient, userId: string, today: string) {
  const { data, error } = await db
    .from('body_measurements')
    .select('weight_kg, body_fat_pct')
    .eq('user_id', userId)
    .gte('measured_on', addDays(today, -BODY_MAX_AGE_DAYS))
    .not('body_fat_pct', 'is', null)
    .order('measured_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return {
    weightKg: data?.weight_kg != null ? Number(data.weight_kg) : null,
    bodyFatPct: data?.body_fat_pct != null ? Number(data.body_fat_pct) : null,
  }
}

export async function gatherGrindAgeInputs(args: {
  db: SupabaseClient
  token: string
  userId: string
  /** The user's local date, YYYY-MM-DD */
  today: string
  timeZone: string
  birthDate: string
  sex: Sex
}): Promise<{ inputs: GrindAgeInputs; failed: string[] }> {
  const { db, token, userId, today, timeZone, birthDate, sex } = args
  // Reads that threw. A failed read is not "no data": the caller must not store a
  // weekly reading built on it, or the gap would stick for the rest of the week.
  const failed: string[] = []

  const [sleep, activity, strengthMinPerWeek, restingHr, heightM, body] = await Promise.all([
    attempt('sleep', () => readSleep(token, today, timeZone), failed),
    attempt('activity', () => readActivity(token, today), failed),
    attempt('strength', () => readStrength(token, today, timeZone), failed),
    attempt('resting heart rate', () => readRestingHr(token, today), failed),
    attempt('height', () => readHeightM(token), failed),
    attempt('body', () => readBody(db, userId, today), failed),
  ])

  const inputs: GrindAgeInputs = {
    chronologicalAge: ageInYears(birthDate, today),
    sex,
    sleepHours: sleep?.sleepHours ?? null,
    sleepConsistencyMin: sleep?.sleepConsistencyMin ?? null,
    dailySteps: activity?.dailySteps ?? null,
    lowerZoneMinPerWeek: activity?.lowerZoneMinPerWeek ?? null,
    higherZoneMinPerWeek: activity?.higherZoneMinPerWeek ?? null,
    strengthMinPerWeek,
    restingHr,
    weightKg: body?.weightKg ?? null,
    bodyFatPct: body?.bodyFatPct ?? null,
    heightM,
  }
  return { inputs, failed }
}
