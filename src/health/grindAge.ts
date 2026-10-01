// GRIND Age on the app side: the response shape, the weekly cache and the fetch.
// The types mirror supabase/functions/_shared/grindAgeTypes.ts (the Vite app can't import from supabase/).

import { invokeFunction } from '../lib/invokeFunction'
import { browserTimeZone } from '../lib/push'
import { readJson, safeLocalStorage, writeJson } from './storage'

export type GrindAgeFactorId =
  | 'sleep_hours'
  | 'sleep_consistency'
  | 'steps'
  | 'lower_zones'
  | 'higher_zones'
  | 'strength'
  | 'resting_hr'
  | 'vo2max'
  | 'lean_mass'

export type GrindAgeFactor = {
  id: GrindAgeFactorId
  label: string
  /** null when the input is missing */
  value: number | null
  unit: string
  target: string
  /** + makes you older, − younger; null when the input is missing */
  years: number | null
  /** Derived rather than measured (VO₂ max) */
  estimated?: boolean
}

export type GrindAgeResult = {
  chronologicalAge: number
  grindAge: number
  factors: GrindAgeFactor[]
  missing: GrindAgeFactorId[]
}

export type GrindAgeOk = {
  status: 'ok'
  /** Monday of the current week, YYYY-MM-DD */
  weekStart: string
  computedAt: string
  result: GrindAgeResult
  /** −1 to 3; null until there are enough weekly readings */
  pace: number | null
  history: { weekStart: string; grindAge: number }[]
  /** True when one or more data reads failed, so this result was not saved and must not be cached */
  partial?: boolean
}

export type GrindAgeResponse = { status: 'needs_profile' } | { status: 'not_connected' } | GrindAgeOk

const cacheKey = (userId: string) => `grind_health:v1:${userId}:age`

/** Monday on or before `today` (YYYY-MM-DD). Calendar maths in UTC so DST can't shift the day. */
export function currentWeekStart(today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

export function readCachedGrindAge(
  userId: string | undefined,
  storage: Storage | null = safeLocalStorage(),
): GrindAgeOk | null {
  if (!userId) return null
  const stored = readJson<GrindAgeOk | null>(cacheKey(userId), null, storage)
  if (!stored || stored.status !== 'ok' || typeof stored.weekStart !== 'string' || !stored.result) return null
  return stored
}

/** Only a finished reading is worth keeping; the other states are cheap to re-ask. */
export function writeCachedGrindAge(
  userId: string | undefined,
  response: GrindAgeResponse,
  storage: Storage | null = safeLocalStorage(),
): void {
  if (!userId || response.status !== 'ok' || response.partial) return
  writeJson(cacheKey(userId), response, storage)
}

const describe = (status: number, payload: { detail?: string; error?: string } | null) =>
  payload?.detail || payload?.error || `GRIND Age request failed (${status})`

export function fetchGrindAge(refresh: boolean): Promise<GrindAgeResponse> {
  return invokeFunction<GrindAgeResponse>(
    'health-age',
    { timeZone: browserTimeZone(), refresh },
    { offline: "Couldn't reach the server", describe },
  )
}

/** "2.1 years younger than your real age" — from GRIND Age minus real age. */
export function ageGapLabel(result: GrindAgeResult): string {
  const gap = Math.round((result.grindAge - result.chronologicalAge) * 10) / 10
  if (Math.abs(gap) < 0.05) return 'Same as your real age'
  const n = Math.abs(gap).toFixed(1)
  return `${n} ${n === '1.0' ? 'year' : 'years'} ${gap < 0 ? 'younger' : 'older'} than your real age`
}

export function formatPace(pace: number): string {
  return `${pace.toFixed(1)}×`
}

const MINUS = '−'

export function formatYears(years: number): string {
  const rounded = Math.round(years * 10) / 10
  if (Math.abs(rounded) < 0.05) return '0.0 y'
  return `${rounded < 0 ? MINUS : '+'}${Math.abs(rounded).toFixed(1)} y`
}

/** Weight 25–350 kg; body fat 3–70 %, optional. Returns an error message or the parsed numbers. */
export function parseMeasurement(
  weight: string,
  bodyFat: string,
): { error: string } | { weightKg: number; bodyFatPct: number | null } {
  const w = Number(weight)
  if (!weight.trim() || !Number.isFinite(w) || w < 25 || w > 350) return { error: 'Weight should be 25–350 kg' }
  if (!bodyFat.trim()) return { weightKg: w, bodyFatPct: null }
  const f = Number(bodyFat)
  if (!Number.isFinite(f) || f < 3 || f > 70) return { error: 'Body fat should be 3–70 %' }
  return { weightKg: w, bodyFatPct: f }
}
