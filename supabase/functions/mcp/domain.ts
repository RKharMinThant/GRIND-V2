// Pure logic for the GRIND MCP server. No I/O, no process-local Date maths: every date is a
// YYYY-MM-DD string handled with UTC arithmetic.
// Mirrors src/lib/{streaks,dates,strength,overload,trainingLoad,duration}.ts, src/health/logic.ts
// and src/types/database.ts. Keep in step.

// ---------------------------------------------------------------- dates

/** Mirrors addDays in src/lib/dates.ts, on date strings. */
export const addDays = (date: string, n: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** Mirrors startOfWeek in src/lib/dates.ts. weekStart: 0 = Sunday, 1 = Monday. */
export function startOfWeek(date: string, weekStart: 0 | 1): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, -((dow - weekStart + 7) % 7))
}

export const isRealDate = (s: string): boolean => {
  const t = Date.parse(`${s}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s
}

/** Offset east of UTC, in minutes, at local noon of `date`. Throws on an unknown zone. */
export function zoneOffsetMinutes(timeZone: string, date: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${date}T12:00:00Z`))
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = name.match(/^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/)
  if (!m || !m[1]) return 0
  const mins = Number(m[2]) * 60 + Number(m[3] ?? 0)
  return m[1] === '-' ? -mins : mins
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Whole years from birth date to a day, both YYYY-MM-DD. */
export function wholeYears(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  let age = ty - by
  if (tm < bm || (tm === bm && td < bd)) age -= 1
  return age
}

// ---------------------------------------------------------------- streaks

export type StreakStats = {
  current: number
  best: number
  totalDays: number
  monthDays: number
  hasToday: boolean
}

/** Mirrors calcStreakStats in src/lib/streaks.ts. `today` is required (the server has no local clock). */
export function calcStreakStats(logDates: string[], today: string): StreakStats {
  const unique = [...new Set(logDates.filter(Boolean))].sort().reverse()
  const dateSet = new Set(unique)
  const hasToday = dateSet.has(today)
  const totalDays = unique.length
  const thisMonth = today.slice(0, 7)
  const monthDays = unique.filter((d) => d.startsWith(thisMonth)).length

  if (!unique.length) return { current: 0, best: 0, totalDays: 0, monthDays: 0, hasToday: false }

  let best = 0
  let run = 0
  let prev: string | null = null
  for (const d of unique) {
    if (prev === null) run = 1
    else if (addDays(prev, -1) === d) run += 1
    else run = 1
    best = Math.max(best, run)
    prev = d
  }

  const anchor = hasToday ? today : addDays(today, -1)
  if (!dateSet.has(anchor)) return { current: 0, best, totalDays, monthDays, hasToday }

  let current = 0
  let cursor = anchor
  while (dateSet.has(cursor)) {
    current += 1
    cursor = addDays(cursor, -1)
  }
  cursor = addDays(anchor, 1)
  while (dateSet.has(cursor)) {
    current += 1
    cursor = addDays(cursor, 1)
  }
  best = Math.max(best, current)
  return { current, best, totalDays, monthDays, hasToday }
}

// ---------------------------------------------------------------- log vocabulary

/** Mirrors isRestLog / isRestWorkout. */
export const REST_RE = /^\s*rest( day)?\s*$/i
export const isRest = (workout: string | null | undefined): boolean => REST_RE.test(workout ?? '')

export const FOCUS_AREAS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Arms', 'Forearms', 'Core', 'Abs',
  'Legs', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Full Body', 'Mobility',
] as const
export const WORKOUT_TYPES = ['Strength', 'Cardio', 'HIIT', 'Flexibility', 'Swim', 'Cycle', 'Other'] as const
export const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core', 'Full Body',
] as const

export const dedupe = <T>(xs: T[]): T[] => [...new Set(xs)]

/** Mirrors serializeFocusAreas (deduped, first-seen order). */
export function serializeFocusAreas(areas: string[]): string | null {
  const a = dedupe(areas)
  return a.length ? a.join(',') : null
}
export function parseFocusAreas(value: string | null | undefined): string[] {
  if (!value?.trim()) return []
  return value.split(',').map((s) => s.trim()).filter(Boolean)
}
export const focusLabel = (areas: string[]): string => areas.join(' · ')

export const round1 = (n: number): number => Math.round(n * 10) / 10

/** Mirrors parseGrams. */
export const gramsOrNull = (n: number | null | undefined): number | null => (n == null ? null : round1(n))

// ---------------------------------------------------------------- duration

/** Mirrors formatDuration in src/lib/duration.ts. */
export function formatDuration(hours: number, minutes: number): string | null {
  const h = Math.max(0, Math.min(12, Math.floor(hours)))
  const m = Math.max(0, Math.min(59, Math.floor(minutes)))
  if (h === 0 && m === 0) return null
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Mirrors parseDuration in src/lib/duration.ts. */
export function parseDuration(value: string | null | undefined): { hours: number; minutes: number } {
  if (!value?.trim()) return { hours: 0, minutes: 0 }
  const s = value.trim().toLowerCase()
  const hm = s.match(/(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?/)
  if (hm && (hm[1] || hm[2])) return { hours: hm[1] ? Number(hm[1]) : 0, minutes: hm[2] ? Number(hm[2]) : 0 }
  if (/^\d+$/.test(s)) {
    const total = Number(s)
    return { hours: Math.floor(total / 60), minutes: total % 60 }
  }
  return { hours: 0, minutes: 0 }
}

export function durationText(min: number | null | undefined): string | null {
  if (!min) return null
  return formatDuration(Math.floor(min / 60), min % 60)
}
export function durationMinutes(text: string | null | undefined): number | null {
  if (!text?.trim()) return null
  const { hours, minutes } = parseDuration(text)
  const total = hours * 60 + minutes
  return total > 0 ? total : null
}

/** Mirrors roundDurationToOptions in src/health/logic.ts, as total minutes (5-min steps, max 12h 55m). */
export const roundDurationToOptions = (min: number): number =>
  Math.min(775, Math.max(0, Math.round(min / 5) * 5))

const TYPE_RULES: [RegExp, (typeof WORKOUT_TYPES)[number]][] = [
  [/weight|strength|lift/i, 'Strength'],
  [/hiit|interval|circuit/i, 'HIIT'],
  [/yoga|pilates|stretch/i, 'Flexibility'],
  [/swim/i, 'Swim'],
  [/bike|cycl|spin/i, 'Cycle'],
  [/run|walk|hike|elliptical|treadmill/i, 'Cardio'],
]
/** Mirrors activityToWorkoutType in src/health/logic.ts. */
export const activityToWorkoutType = (activity: string): (typeof WORKOUT_TYPES)[number] =>
  TYPE_RULES.find(([re]) => re.test(activity))?.[1] ?? 'Other'

// ---------------------------------------------------------------- lifts

export type WeightUnit = 'kg' | 'lb'
export type LiftSet = { reps: number; weight: number }
export type PrKind = 'oneRepMax' | 'heaviest' | 'volume'
export type HistoryPoint = { sets_detail: LiftSet[]; unit: string; recorded_at: string }

const KG_PER_LB = 0.45359237
const EPLEY_REP_CAP = 12
const roundTo = (n: number, step: number): number => Math.round(n / step) * step

/** Mirrors expandUniformSets in src/types/database.ts. */
export function expandUniformSets(sets: number, reps: number, weight: number): LiftSet[] {
  const n = Math.max(0, Math.floor(sets))
  if (n === 0) return []
  const r = Math.max(0, Math.floor(reps))
  const w = Math.max(0, Number(weight) || 0)
  return Array.from({ length: n }, () => ({ reps: r, weight: w }))
}

/** Mirrors parseSetsDetail in src/types/database.ts. */
export function parseSetsDetail(
  raw: unknown,
  fallback?: { sets: number; reps: number; weight: number },
): LiftSet[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item) => {
      const o = item as Record<string, unknown>
      return {
        reps: Math.max(0, Math.floor(Number(o.reps) || 0)),
        weight: Math.max(0, Number(o.weight) || 0),
      }
    })
  }
  if (fallback && fallback.sets > 0) return expandUniformSets(fallback.sets, fallback.reps, fallback.weight)
  return []
}

export const volumeOf = (sets: LiftSet[]): number => sets.reduce((s, x) => s + x.reps * x.weight, 0)
export const maxWeight = (sets: LiftSet[]): number => sets.reduce((m, x) => Math.max(m, x.weight), 0)
export const setsEqual = (a: LiftSet[], b: LiftSet[]): boolean =>
  a.length === b.length && a.every((s, i) => s.reps === b[i].reps && s.weight === b[i].weight)

export function toUnit(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value
  return from === 'lb' ? value * KG_PER_LB : value / KG_PER_LB
}

/** Epley, reps capped at 12, rounded to 0.5; a single is the weight. */
export function estimatedOneRepMax(set: LiftSet): number {
  if (set.reps <= 0 || set.weight <= 0) return 0
  if (set.reps === 1) return set.weight
  const reps = Math.min(set.reps, EPLEY_REP_CAP)
  return roundTo(set.weight * (1 + reps / 30), 0.5)
}
export const bestOneRepMax = (sets: LiftSet[]): number =>
  sets.reduce((best, s) => Math.max(best, estimatedOneRepMax(s)), 0)

export function convertSets(sets: LiftSet[], from: WeightUnit, to: WeightUnit): LiftSet[] {
  if (from === to) return sets
  return sets.map((s) => ({ reps: s.reps, weight: roundTo(toUnit(s.weight, from, to), 0.1) }))
}

export type Metrics = { oneRepMax: number; heaviest: number; heaviestReps: number; volume: number }

export function metricsOf(sets: LiftSet[]): Metrics {
  let heaviest = 0
  let heaviestReps = 0
  for (const s of sets) {
    if (s.weight > heaviest || (s.weight === heaviest && s.reps > heaviestReps)) {
      heaviest = s.weight
      heaviestReps = s.reps
    }
  }
  return { oneRepMax: bestOneRepMax(sets), heaviest, heaviestReps, volume: roundTo(volumeOf(sets), 0.1) }
}

const asUnit = (u: string): WeightUnit => (u === 'lb' ? 'lb' : 'kg')
export const pointMetrics = (p: HistoryPoint, unit: WeightUnit): Metrics =>
  metricsOf(convertSets(p.sets_detail, asUnit(p.unit), unit))
const byTime = <T extends { recorded_at: string }>(h: T[]): T[] =>
  [...h].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))

export type PersonalBests = {
  oneRepMax: { value: number; recorded_at: string } | null
  heaviest: { value: number; reps: number; recorded_at: string } | null
  volume: { value: number; recorded_at: string } | null
}

/** Mirrors personalBests in src/lib/strength.ts. Earliest entry wins ties. */
export function personalBests(history: HistoryPoint[], unit: WeightUnit): PersonalBests {
  const bests: PersonalBests = { oneRepMax: null, heaviest: null, volume: null }
  for (const p of byTime(history)) {
    const m = pointMetrics(p, unit)
    if (m.oneRepMax > 0 && m.oneRepMax > (bests.oneRepMax?.value ?? 0)) {
      bests.oneRepMax = { value: m.oneRepMax, recorded_at: p.recorded_at }
    }
    if (m.heaviest > 0 && m.heaviest > (bests.heaviest?.value ?? 0)) {
      bests.heaviest = { value: m.heaviest, reps: m.heaviestReps, recorded_at: p.recorded_at }
    }
    if (m.volume > 0 && m.volume > (bests.volume?.value ?? 0)) {
      bests.volume = { value: m.volume, recorded_at: p.recorded_at }
    }
  }
  return bests
}

export type PrEvent = { kind: PrKind; value: number; unit: WeightUnit; recorded_at: string }

/** Mirrors prEvents in src/lib/strength.ts: strictly beats every earlier entry; the first is never a PR. */
export function prEvents(history: HistoryPoint[], unit: WeightUnit): PrEvent[] {
  const events: PrEvent[] = []
  let best: { oneRepMax: number; heaviest: number; volume: number } | null = null
  for (const p of byTime(history)) {
    const m = pointMetrics(p, unit)
    if (best) {
      const kinds: [PrKind, number, number][] = [
        ['oneRepMax', m.oneRepMax, best.oneRepMax],
        ['heaviest', m.heaviest, best.heaviest],
        ['volume', m.volume, best.volume],
      ]
      for (const [kind, value, prior] of kinds) {
        if (value > prior) events.push({ kind, value, unit, recorded_at: p.recorded_at })
      }
      best = {
        oneRepMax: Math.max(best.oneRepMax, m.oneRepMax),
        heaviest: Math.max(best.heaviest, m.heaviest),
        volume: Math.max(best.volume, m.volume),
      }
    } else {
      best = { oneRepMax: m.oneRepMax, heaviest: m.heaviest, volume: m.volume }
    }
  }
  return events
}

/** Mirrors newPrKinds in src/lib/strength.ts. */
export function newPrKinds(previous: HistoryPoint[], newSets: LiftSet[], unit: WeightUnit): PrKind[] {
  if (previous.length === 0) return []
  const prior = personalBests(previous, unit)
  const m = metricsOf(newSets)
  const kinds: PrKind[] = []
  if (m.oneRepMax > (prior.oneRepMax?.value ?? 0)) kinds.push('oneRepMax')
  if (m.heaviest > (prior.heaviest?.value ?? 0)) kinds.push('heaviest')
  if (m.volume > (prior.volume?.value ?? 0)) kinds.push('volume')
  return kinds
}

/** Output names used by the tools. */
export const PR_KIND_OUT: Record<PrKind, 'est_1rm' | 'heaviest' | 'volume'> = {
  oneRepMax: 'est_1rm',
  heaviest: 'heaviest',
  volume: 'volume',
}

// ---------------------------------------------------------------- training load

export type LoadStatus = 'building' | 'ramping' | 'lighter' | 'steady'
export const RAMPING_ABOVE = 1.5
export const LIGHTER_BELOW = 0.8
export const LOAD_STATUS_TEXT: Record<LoadStatus, string> = {
  building: 'Building your baseline',
  ramping: 'Ramping up fast — ease in to avoid overreaching',
  lighter: 'Lighter than usual',
  steady: 'In your usual range',
}

export function loadStatus(ratio: number | null): LoadStatus {
  if (ratio === null) return 'building'
  if (ratio > RAMPING_ABOVE) return 'ramping'
  if (ratio < LIGHTER_BELOW) return 'lighter'
  return 'steady'
}

function sumDays(byDay: Map<string, number>, today: string, from: number, to: number): number {
  let total = 0
  for (let i = from; i <= to; i++) total += byDay.get(addDays(today, -i)) ?? 0
  return total
}

/** Mirrors loadSummary in src/lib/trainingLoad.ts. */
export function loadSummary(byDay: Map<string, number>, today: string, baselineDays = 28) {
  const thisWeek = sumDays(byDay, today, 0, 6)
  const baseline = sumDays(byDay, today, 7, 6 + baselineDays) / (baselineDays / 7)
  const ratio = baseline > 0 ? thisWeek / baseline : null
  return { thisWeek, baseline, ratio, status: loadStatus(ratio) }
}

/** Mirrors formatVsAverage: "+18%" / "-12%" / "0%", or null with no baseline. */
export function formatVsAverage(ratio: number | null): string | null {
  if (ratio === null) return null
  const pct = Math.round((ratio - 1) * 100)
  return `${pct > 0 ? '+' : pct < 0 ? '-' : ''}${Math.abs(pct)}%`
}

// ---------------------------------------------------------------- misc

/** camelCase -> snake_case keys, recursively. */
export function snakeKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(snakeKeys)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [
        k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
        snakeKeys(x),
      ]),
    )
  }
  return v
}

export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Keeps `,()*%` and other PostgREST syntax out of an `or` filter. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[^\p{L}\p{N} '-]/gu, ' ').replace(/\s+/g, ' ').trim()
}
