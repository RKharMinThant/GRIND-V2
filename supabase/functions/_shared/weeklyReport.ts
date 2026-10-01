// The Sunday "week in review": a few numbers from the last seven days, as one line.
//
// Pure on purpose, like notifyRules.ts: the dispatcher loads rows and this only adds
// them up. "This week" is the 7 days ending on the user's local day (localDay−6 …
// localDay); "last week" is the 7 days before that (localDay−13 … localDay−7).

import { weekStartOf } from './grindAgeInputs.ts'
import { isRestWorkout } from './restDay.ts'

export type WeeklySummary = {
  /** Distinct training days this week. */
  sessions: number
  /** The user's weekly session goal. */
  goal: number
  volumeKg: number
  lastVolumeKg: number
  /** Distinct lifts that set a new estimated-1RM best this week. */
  prs: number
  /** Fitbit active zone minutes; null when Fitbit gave us nothing. */
  zoneMinutes: number | null
  /** Change in GRIND Age since last week's reading; null unless this week's and last week's both exist. */
  grindAgeChange: number | null
}

export type WeeklyInput = {
  /** The user's local date, YYYY-MM-DD. */
  localDay: string
  goal: number
  /** `date` is the log's YYYY-MM-DD; rest days are ignored. */
  logs: { date: string; workout: string | null }[]
  /** lift_history rows with `date` already bucketed into the user's local day. Include earlier history: PRs need it. */
  lifts: {
    liftId: string
    /** recorded_at, for ordering rows of the same lift. */
    recordedAt: string
    date: string
    sets: { reps: number; weight: number }[]
    unit: string
  }[]
  /** Daily Fitbit zone minutes, or null when none were fetched. */
  azm: { date: string; fatBurn: number; cardio: number; peak: number }[] | null
  /** Latest GRIND Age weekly readings, newest first; `weekStart` is the Monday YYYY-MM-DD. */
  grindAges: { weekStart: string; grindAge: number }[]
}

const KG_PER_LB = 0.45359237
/** Epley is unreliable for high-rep sets, so reps above this count as this many. */
const EPLEY_REP_CAP = 12

function addDays(date: string, delta: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10)
}

const toKg = (weight: number, unit: string) => (unit === 'lb' ? weight * KG_PER_LB : weight)

function volumeKg(sets: WeeklyInput['lifts'][number]['sets'], unit: string): number {
  return sets.reduce((sum, s) => sum + (s.reps > 0 && s.weight > 0 ? s.reps * toKg(s.weight, unit) : 0), 0)
}

// Mirrors estimatedOneRepMax / bestOneRepMax in src/lib/strength.ts (Epley, reps capped
// at 12, a single is the weight itself), compared in kg and rounded to the nearest 0.5 kg
// like the app, so a smaller gain is not a PR.
function bestOneRepMaxKg(sets: WeeklyInput['lifts'][number]['sets'], unit: string): number {
  let best = 0
  for (const s of sets) {
    if (!(s.reps > 0) || !(s.weight > 0)) continue
    const kg = toKg(s.weight, unit)
    const est = s.reps === 1 ? kg : kg * (1 + Math.min(s.reps, EPLEY_REP_CAP) / 30)
    best = Math.max(best, est)
  }
  return Math.round(best * 2) / 2
}

export function summarizeWeek(input: WeeklyInput): WeeklySummary {
  const thisStart = addDays(input.localDay, -6)
  const lastStart = addDays(input.localDay, -13)
  const lastEnd = addDays(input.localDay, -7)
  const inThisWeek = (d: string) => d >= thisStart && d <= input.localDay
  const inLastWeek = (d: string) => d >= lastStart && d <= lastEnd

  const sessions = new Set(
    input.logs.filter((l) => inThisWeek(l.date) && !isRestWorkout(l.workout)).map((l) => l.date),
  ).size

  let thisVolume = 0
  let lastVolume = 0
  const prLifts = new Set<string>()
  const bestByLift = new Map<string, number>()
  const ordered = [...input.lifts].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
  for (const row of ordered) {
    if (inThisWeek(row.date)) thisVolume += volumeKg(row.sets, row.unit)
    else if (inLastWeek(row.date)) lastVolume += volumeKg(row.sets, row.unit)

    const oneRm = bestOneRepMaxKg(row.sets, row.unit)
    const prior = bestByLift.get(row.liftId)
    // The first row of a lift has nothing to beat; a tie is not a PR
    if (prior !== undefined && inThisWeek(row.date) && oneRm > prior) prLifts.add(row.liftId)
    bestByLift.set(row.liftId, Math.max(prior ?? 0, oneRm))
  }

  let zoneMinutes: number | null = null
  if (input.azm) {
    zoneMinutes = input.azm
      .filter((d) => inThisWeek(d.date))
      .reduce((sum, d) => sum + d.fatBurn + d.cardio + d.peak, 0)
  }

  // Only a reading for this week against the one exactly a week before it is a real change
  const [latest, previous] = input.grindAges
  const consecutive =
    latest != null &&
    previous != null &&
    latest.weekStart === weekStartOf(input.localDay) &&
    previous.weekStart === addDays(latest.weekStart, -7)
  const grindAgeChange = consecutive
    ? Math.round((latest.grindAge - previous.grindAge) * 10) / 10 || 0
    : null

  return {
    sessions,
    goal: input.goal,
    volumeKg: thisVolume,
    lastVolumeKg: lastVolume,
    prs: prLifts.size,
    zoneMinutes,
    grindAgeChange,
  }
}

/** One compact line: "4/4 sessions · volume +8% · 2 PRs · 410 zone min · GRIND Age −0.2". */
export function weeklyReportBody(s: WeeklySummary): string {
  const parts = [`${s.sessions}/${s.goal} sessions`]

  if (s.lastVolumeKg > 0) {
    const pct = Math.round(((s.volumeKg - s.lastVolumeKg) / s.lastVolumeKg) * 100)
    parts.push(`volume ${pct > 0 ? '+' : pct < 0 ? '−' : '±'}${Math.abs(pct)}%`)
  } else if (s.volumeKg > 0) {
    parts.push(`volume ${Math.round(s.volumeKg).toLocaleString('en-US')} kg`)
  }

  if (s.prs > 0) parts.push(`${s.prs} ${s.prs === 1 ? 'PR' : 'PRs'}`)
  if (s.zoneMinutes != null) parts.push(`${Math.round(s.zoneMinutes).toLocaleString('en-US')} zone min`)

  if (s.grindAgeChange != null) {
    const change = Math.round(s.grindAgeChange * 10) / 10
    if (change !== 0) parts.push(`GRIND Age ${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}`)
  }

  return parts.join(' · ')
}
