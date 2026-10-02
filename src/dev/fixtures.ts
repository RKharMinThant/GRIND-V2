// Dev-only demo data for the /preview design page. Never imported by production code.
// Dates are relative to "today" so the screens always look current.

import { currentWeekStart, type GrindAgeFactor, type GrindAgeOk } from '../health/grindAge'
import type { PushState } from '../hooks/usePush'
import { addDays, toLocalDateString } from '../lib/dates'
import type { LiftHistoryPoint } from '../lib/overload'
import { volumeOf } from '../lib/overload'
import type { NotificationPrefs } from '../lib/push'
import { calcStreakStats } from '../lib/streaks'
import type { DistanceUnit, WeekStart, WeightUnit } from '../lib/units'
import { EMPTY_HEALTH_FIELDS } from '../health/types'
import { MUSCLE_GROUPS, type LiftSet, type Log, type TrackedLift } from '../types/database'

/** Marker so a production bundle can be grepped for leaked preview code. */
export const __preview_fixture = true

export const PREVIEW_USER_ID = 'preview-user'

export const profile = {
  displayName: 'Andy',
  email: 'andy@example.com',
  weeklyGoal: 4,
  dailyStepGoal: 10000,
  distanceUnit: 'km' as DistanceUnit,
  weightUnit: 'kg' as WeightUnit,
  weekStart: 1 as WeekStart,
  birthDate: '1996-03-14',
  sex: 'male' as const,
  notificationPrefs: {
    readiness: true,
    workout_done: true,
    rest_day: true,
    weekly_report: true,
    streak_risk: true,
    step_goal: false,
    inactivity: false,
    recovery_milestone: false,
    fitbit_expired: true,
  } satisfies NotificationPrefs,
}

export const pushState: PushState = {
  support: 'supported',
  configured: true,
  permission: 'granted',
  subscribed: true,
  busy: false,
  error: null,
  enable: async () => {},
  disable: async () => {},
  sendTest: async () => {},
}

// ── Logs: ~10 weeks, 3 days on / 1 rest, evenings ─────────────────────────────

const WEEKS = 10
const DAYS = WEEKS * 7

type Session = {
  workout: string
  type: string
  focus: string
  durations: string[]
  meals: string[]
  notes: (string | null)[]
}

const SESSIONS: Session[] = [
  {
    workout: 'Push Day',
    type: 'Strength',
    focus: 'Chest,Shoulders,Triceps',
    durations: ['1h 10m', '1h 5m', '1h 15m', '1h'],
    meals: ['Chicken rice bowl, eggs', 'Greek yogurt and oats', 'Salmon, sweet potato'],
    notes: ['Bench felt strong. Added a rep on the last set.', null, 'Shoulders a bit tight, warmed up longer.'],
  },
  {
    workout: 'Pull Day',
    type: 'Strength',
    focus: 'Back,Biceps,Forearms',
    durations: ['1h 10m', '1h', '55m', '1h 5m'],
    meals: ['Beef stir fry', 'Tuna wrap, banana', 'Chicken pasta'],
    notes: [null, 'Rows moved well. Grip gave out before the back did.', null],
  },
  {
    workout: 'Leg Day',
    type: 'Strength',
    focus: 'Quads,Hamstrings,Glutes,Calves',
    durations: ['1h 20m', '1h 15m', '1h 10m', '1h 25m'],
    meals: ['Big pasta dinner', 'Rice, chicken, veg', 'Burrito bowl'],
    notes: ['Squats were heavy. Walked out wobbly.', null, 'New squat PR on the top set.'],
  },
]

function logAt(date: string, fields: Partial<Log> & Pick<Log, 'workout'>, seed: number): Log {
  // Evening sessions: logged around 19:30–21:00 local
  const created = new Date(`${date}T${19 + (seed % 2)}:${seed % 2 ? '45' : '15'}:00`)
  return {
    id: `demo-log-${date}`,
    user_id: PREVIEW_USER_ID,
    log_date: date,
    workout_type: null,
    focus_areas: null,
    duration: null,
    meal: null,
    notes: null,
    protein_g: null,
    creatine_g: null,
    photo_path: null,
    created_at: created.toISOString(),
    updated_at: created.toISOString(),
    ...EMPTY_HEALTH_FIELDS,
    ...fields,
  }
}

function buildLogs(): Log[] {
  const today = toLocalDateString()
  const out: Log[] = []
  // Rest days that were not logged (so the streak is realistic rather than 70 days)
  const unloggedRest = new Set([1, 4, 6])
  for (let k = 0; k < DAYS; k++) {
    const date = addDays(today, -k)
    const pos = k % 4 // 0,1,2 = train · 3 = rest
    if (pos === 3) {
      if (unloggedRest.has(Math.floor(k / 4))) continue
      out.push(logAt(date, { workout: 'Rest' }, k))
      continue
    }
    // Walk the push → pull → legs rotation backwards in time
    const cycle = Math.floor(k / 4)
    const session = SESSIONS[(((cycle * 3 + (2 - pos)) % 3) + 3) % 3]
    out.push(
      logAt(
        date,
        {
          workout: session.workout,
          workout_type: session.type,
          focus_areas: session.focus,
          duration: session.durations[k % session.durations.length],
          meal: session.meals[k % session.meals.length],
          notes: session.notes[k % session.notes.length],
          protein_g: [140, 155, 165, 150][k % 4],
          creatine_g: k % 5 === 0 ? null : 5,
        },
        k,
      ),
    )
  }
  return out.sort((a, b) => (a.log_date < b.log_date ? 1 : -1))
}

export const logs: Log[] = buildLogs()
export const stats = calcStreakStats(logs.map((l) => l.log_date))
export const photoUrls: Record<string, string> = {}

// ── Tracked lifts with ~10 weekly snapshots each ─────────────────────────────

type LiftSpec = {
  group: (typeof MUSCLE_GROUPS)[number]
  name: string
  start: number
  step: number
  reps: [number, number, number]
}

const LIFT_SPECS: LiftSpec[] = [
  { group: 'Chest', name: 'Bench Press', start: 70, step: 2.5, reps: [8, 8, 6] },
  { group: 'Chest', name: 'Incline Dumbbell Press', start: 24, step: 1, reps: [10, 9, 8] },
  { group: 'Back', name: 'Barbell Row', start: 65, step: 2.5, reps: [8, 8, 8] },
  { group: 'Back', name: 'Lat Pulldown', start: 55, step: 2.5, reps: [10, 10, 8] },
  { group: 'Shoulders', name: 'Overhead Press', start: 42.5, step: 1.25, reps: [8, 7, 6] },
  { group: 'Legs', name: 'Back Squat', start: 90, step: 5, reps: [6, 6, 5] },
  { group: 'Legs', name: 'Romanian Deadlift', start: 80, step: 5, reps: [8, 8, 8] },
  { group: 'Biceps', name: 'EZ-Bar Curl', start: 30, step: 1.25, reps: [10, 9, 8] },
]

const SNAPSHOTS = 10

function snapshotSets(spec: LiftSpec, i: number): LiftSet[] {
  // Weight climbs most weeks with a plateau at week 5; reps dip a little right after a jump
  const jumps = Math.max(0, i - (i > 5 ? 1 : 0))
  const weight = Math.round((spec.start + spec.step * jumps) / 0.25) * 0.25
  const dip = i > 0 && i !== 5 && i % 3 === 0 ? 1 : 0
  return spec.reps.map((reps) => ({ reps: Math.max(3, reps - dip), weight }))
}

function buildLifts(): { lifts: TrackedLift[]; history: LiftHistoryPoint[] } {
  const today = toLocalDateString()
  const lifts: TrackedLift[] = []
  const history: LiftHistoryPoint[] = []
  LIFT_SPECS.forEach((spec, n) => {
    const id = `demo-lift-${n + 1}`
    const snaps = Array.from({ length: SNAPSHOTS }, (_, i) => {
      const date = addDays(today, -(SNAPSHOTS - 1 - i) * 7 - (n % 3))
      const sets = snapshotSets(spec, i)
      const recorded = new Date(`${date}T20:${String(10 + n * 3).padStart(2, '0')}:00`).toISOString()
      return { sets, recorded }
    })
    snaps.forEach((s, i) =>
      history.push({
        id: `${id}-h${i + 1}`,
        lift_id: id,
        sets_detail: s.sets,
        unit: 'kg',
        volume: volumeOf(s.sets),
        recorded_at: s.recorded,
      }),
    )
    const cur = snaps[SNAPSHOTS - 1].sets
    const prev = snaps[SNAPSHOTS - 2].sets
    const sameGroupBefore = LIFT_SPECS.slice(0, n).filter((x) => x.group === spec.group).length
    lifts.push({
      id,
      user_id: PREVIEW_USER_ID,
      muscle_group: spec.group,
      exercise_name: spec.name,
      sets: cur.length,
      reps: cur[0].reps,
      weight: cur[0].weight,
      unit: 'kg',
      sets_detail: cur,
      prev_sets: prev.length,
      prev_reps: prev[0].reps,
      prev_weight: prev[0].weight,
      prev_sets_detail: prev,
      sort_order: sameGroupBefore,
      created_at: snaps[0].recorded,
      updated_at: snaps[SNAPSHOTS - 1].recorded,
    })
  })
  return { lifts, history }
}

const built = buildLifts()
export const lifts: TrackedLift[] = built.lifts
export const liftHistory: LiftHistoryPoint[] = built.history

/** Same grouping the app builds in useTrackedLifts. */
export const byMuscle: { group: string; lifts: TrackedLift[] }[] = MUSCLE_GROUPS.flatMap((group) => {
  const list = lifts.filter((l) => l.muscle_group === group)
  return list.length ? [{ group, lifts: list }] : []
})

export async function fetchHistory(liftId: string, limit = 24): Promise<LiftHistoryPoint[]> {
  return liftHistory.filter((h) => h.lift_id === liftId).slice(-limit)
}

export async function fetchAllHistory(): Promise<LiftHistoryPoint[]> {
  return [...liftHistory].sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : 1))
}

// ── GRIND Age ─────────────────────────────────────────────────────────────────

const factors: GrindAgeFactor[] = [
  { id: 'sleep_hours', label: 'Sleep', value: 6.4, unit: 'h', target: '7–8 h', years: 1.2 },
  { id: 'sleep_consistency', label: 'Sleep consistency', value: 42, unit: 'min', target: '≤ 30 min drift', years: 0.6 },
  { id: 'steps', label: 'Daily steps', value: 9840, unit: 'steps', target: '8,000+ steps', years: -0.4 },
  { id: 'lower_zones', label: 'Easy cardio (zones 1–3)', value: 118, unit: 'min/wk', target: '150+ min/wk', years: 0.3 },
  { id: 'higher_zones', label: 'Hard cardio (zones 4–5)', value: 42, unit: 'min/wk', target: '75+ min/wk', years: 0.2 },
  { id: 'strength', label: 'Strength training', value: 195, unit: 'min/wk', target: '60+ min/wk', years: -0.6 },
  { id: 'resting_hr', label: 'Resting heart rate', value: 56, unit: 'bpm', target: '≤ 60 bpm', years: -0.4 },
  { id: 'vo2max', label: 'VO₂ max', value: 41.2, unit: 'ml/kg/min', target: '≥ 43 ml/kg/min', years: 0.7, estimated: true },
  { id: 'lean_mass', label: 'Lean mass (FFMI)', value: null, unit: 'kg/m²', target: '18–22 kg/m²', years: null },
]

export const grindAgeData: GrindAgeOk = {
  status: 'ok',
  weekStart: currentWeekStart(toLocalDateString()),
  computedAt: new Date().toISOString(),
  result: {
    chronologicalAge: 30,
    grindAge: 31.6,
    factors,
    missing: ['lean_mass'],
  },
  pace: null,
  history: [],
}

// ── Sample day for the single-session sheet ──────────────────────────────────

export const sampleLog: Log = logs.find((l) => l.workout !== 'Rest' && l.notes) ?? logs[0]
