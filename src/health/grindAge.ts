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

// ── Page helpers (pure, so the GRIND Age page stays free of logic) ────────────

export type GapTone = 'accent' | 'activity' | 'danger'

/** GRIND Age minus real age, to one decimal (what every gap label shows). */
export function ageGap(result: GrindAgeResult): number {
  return Math.round((result.grindAge - result.chronologicalAge) * 10) / 10
}

/** Hero colour: lime when clearly younger, blue when level, red when clearly older. */
export function gapTone(gap: number): GapTone {
  const g = Math.round(gap * 10) / 10
  return g <= -0.5 ? 'accent' : g >= 0.5 ? 'danger' : 'activity'
}

/** Signed gap for the stat row: "+1.6", "−2.1", "0.0". */
export function formatGap(gap: number): string {
  const rounded = Math.round(gap * 10) / 10
  if (Math.abs(rounded) < 0.05) return '0.0'
  return `${rounded < 0 ? MINUS : '+'}${Math.abs(rounded).toFixed(1)}`
}

const yearsWord = (n: string) => (n === '1.0' ? 'year' : 'years')

/** Short gauge caption: "1.6 yrs older", "2.1 yrs younger", "On par". */
export function gapSublabel(gap: number): string {
  const rounded = Math.round(gap * 10) / 10
  if (Math.abs(rounded) < 0.05) return 'On par'
  return `${Math.abs(rounded).toFixed(1)} yrs ${rounded < 0 ? 'younger' : 'older'}`
}

/** One plain-language line under the hero stats. */
export function gapSentence(gap: number): string {
  const rounded = Math.round(gap * 10) / 10
  if (Math.abs(rounded) < 0.05) return 'Your habits are keeping you right on your real age.'
  const n = Math.abs(rounded).toFixed(1)
  return rounded > 0
    ? `Your habits add ${n} ${yearsWord(n)} to your real age.`
    : `Your habits take ${n} ${yearsWord(n)} off your real age.`
}

/** Pace dial colour: below 0.95× slower than the calendar, above 1.05× faster. */
export function paceTone(pace: number): GapTone {
  return pace < 0.95 ? 'accent' : pace > 1.05 ? 'danger' : 'activity'
}

export function paceSublabel(pace: number): string {
  return pace < 0.95
    ? 'Ageing slower than the calendar'
    : pace > 1.05
      ? 'Ageing faster than the calendar'
      : 'Ageing in step with the calendar'
}

/** Weeks the readings must span before pace can be worked out (the server's PACE_MIN_SPAN_DAYS) */
export const PACE_SPAN_WEEKS = 12

/**
 * Countdown to the pace of ageing. The server needs the readings to span 12 weeks, so this counts
 * whole weeks from the oldest reading (history is oldest first) to the current week, not readings.
 * `needsReadings` means the span is long enough but pace is still null (too few recent readings).
 */
export function paceWeeksToGo(
  history: { weekStart: string }[],
  currentWeekStart: string,
): { spanWeeks: number; weeksToGo: number; filled: number; needsReadings: boolean } {
  const spanWeeks =
    history.length === 0
      ? 0
      : Math.max(0, Math.floor((Date.parse(currentWeekStart) - Date.parse(history[0].weekStart)) / (7 * 86_400_000)))
  return {
    spanWeeks,
    weeksToGo: Math.max(1, PACE_SPAN_WEEKS - spanWeeks),
    filled: Math.min(PACE_SPAN_WEEKS, spanWeeks + 1),
    needsReadings: spanWeeks >= PACE_SPAN_WEEKS,
  }
}

/** Weekly readings for the trend line, with this week's reading appended when history lacks it. */
export function trendPoints(data: GrindAgeOk): { weekStart: string; grindAge: number }[] {
  const points = [...data.history]
  if (points[points.length - 1]?.weekStart !== data.weekStart) {
    points.push({ weekStart: data.weekStart, grindAge: data.result.grindAge })
  }
  return points
}

/** "7.4 h" / "9,840 steps": whole numbers keep separators, decimals round to one place. */
export function formatFactorValue(value: number, unit: string): string {
  const shown = Number.isInteger(value) ? value.toLocaleString() : String(Math.round(value * 10) / 10)
  return `${shown} ${unit}`
}

export type FactorGroupId = 'sleep' | 'cardio' | 'strength'

export type FactorGroup = {
  id: FactorGroupId
  label: string
  /** Metric colour for the group's bars */
  tone: 'sleep' | 'activity' | 'strength'
  factors: GrindAgeFactorId[]
}

export const FACTOR_GROUPS: FactorGroup[] = [
  { id: 'sleep', label: 'Sleep', tone: 'sleep', factors: ['sleep_hours', 'sleep_consistency'] },
  {
    id: 'cardio',
    label: 'Cardio',
    tone: 'activity',
    factors: ['steps', 'lower_zones', 'higher_zones', 'resting_hr', 'vo2max'],
  },
  { id: 'strength', label: 'Strength & body', tone: 'strength', factors: ['strength', 'lean_mass'] },
]

/** Net years a group adds (+) or takes off (−); null when none of its factors has data. */
export function groupYears(result: GrindAgeResult, groupId: FactorGroupId): number | null {
  const group = FACTOR_GROUPS.find((g) => g.id === groupId)
  if (!group) return null
  let sum = 0
  let any = false
  for (const f of result.factors) {
    if (!group.factors.includes(f.id) || f.years == null) continue
    sum += f.years
    any = true
  }
  // Rounded so float noise (0.1 + 0.2) never shows up in a comparison or a label
  return any ? Math.round(sum * 100) / 100 : null
}

const TIPS: Record<GrindAgeFactorId, string> = {
  sleep_hours: 'Aim for 7–8 h: a fixed lights-out time helps most',
  sleep_consistency: 'Keep bed and wake times within 30 min, weekends included',
  steps: 'A 10-minute walk after each meal adds up fast',
  lower_zones: 'Easy, talk-while-you-go sessions count: brisk walks, cycling, a jog',
  higher_zones: 'One short interval session a week, like 4 × 4 min hard, is enough',
  resting_hr: 'It drifts down with steady easy cardio and regular sleep',
  vo2max: 'Hard intervals once or twice a week raise it fastest',
  strength: 'Two or three full-body sessions a week is a solid base',
  lean_mass: 'Lift progressively and get protein at each meal',
}

/** One specific, non-medical nudge for a factor that is costing years. */
export function factorTip(id: GrindAgeFactorId): string {
  return TIPS[id]
}

const MISSING: Record<GrindAgeFactorId, string> = {
  sleep_hours: 'Wear your tracker to bed to record sleep',
  sleep_consistency: 'Needs a week or so of tracked sleep',
  steps: 'Wear your tracker through the day',
  lower_zones: 'Needs a few days of tracked workouts',
  higher_zones: 'Needs a few days of tracked workouts',
  resting_hr: 'Needs a few nights of tracked sleep',
  vo2max: 'Fitbit estimates it after tracked runs or brisk walks',
  strength: 'Log strength sessions in GRIND',
  lean_mass: 'Log weight and body fat below',
}

/** How to fill in a factor that has no data yet. */
export function missingHint(id: GrindAgeFactorId): string {
  return MISSING[id]
}
