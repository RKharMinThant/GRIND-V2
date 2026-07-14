export type Profile = {
  id: string
  display_name: string | null
  weekly_goal?: number | null
  created_at: string
}

export type Log = {
  id: string
  user_id: string
  log_date: string
  workout: string
  workout_type: string | null
  /** Comma-separated focus areas, e.g. "Chest,Triceps,Abs" */
  focus_areas: string | null
  duration: string | null
  meal: string | null
  notes: string | null
  /** Protein intake in grams for this session / day */
  protein_g: number | null
  /** Creatine intake in grams for this session / day */
  creatine_g: number | null
  photo_path: string | null
  created_at: string
  updated_at: string
}

export type LogInsert = {
  log_date: string
  workout: string
  workout_type?: string | null
  focus_areas?: string | null
  duration?: string | null
  meal?: string | null
  notes?: string | null
  protein_g?: number | null
  creatine_g?: number | null
  photo_path?: string | null
}

export type LogUpdate = Partial<LogInsert>

/** One working set (reps + load) */
export type LiftSet = {
  reps: number
  weight: number
}

/** User-managed lift on the Progress board (not tied to session logs) */
export type TrackedLift = {
  id: string
  user_id: string
  muscle_group: string
  exercise_name: string
  /** Derived: number of sets (length of sets_detail) */
  sets: number
  /** Derived summary (first set reps) — kept for legacy / simple queries */
  reps: number
  /** Derived summary (first set weight) */
  weight: number
  unit: 'kg' | 'lb'
  /** Per-set prescription */
  sets_detail: LiftSet[]
  prev_sets: number | null
  prev_reps: number | null
  prev_weight: number | null
  prev_sets_detail: LiftSet[] | null
  sort_order: number
  created_at: string
  updated_at: string
}

export type TrackedLiftInput = {
  muscle_group: string
  exercise_name: string
  /** Preferred: full set list. If omitted, falls back to sets/reps/weight. */
  sets_detail?: LiftSet[]
  sets?: number
  reps?: number
  weight?: number
  unit?: 'kg' | 'lb'
}

/** Build a uniform set list from legacy scalars. */
export function expandUniformSets(sets: number, reps: number, weight: number): LiftSet[] {
  const n = Math.max(0, Math.floor(sets))
  if (n === 0) return []
  const r = Math.max(0, Math.floor(reps))
  const w = Math.max(0, Number(weight) || 0)
  return Array.from({ length: n }, () => ({ reps: r, weight: w }))
}

/** Normalize raw JSON / legacy rows into LiftSet[]. */
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
  if (fallback && fallback.sets > 0) {
    return expandUniformSets(fallback.sets, fallback.reps, fallback.weight)
  }
  return []
}

export function summarizeSets(detail: LiftSet[]): { sets: number; reps: number; weight: number } {
  if (!detail.length) return { sets: 0, reps: 0, weight: 0 }
  return {
    sets: detail.length,
    reps: detail[0].reps,
    weight: detail[0].weight,
  }
}

/**
 * Muscle groups for the Progress lift board.
 * Kept short so the picker is a clean grid (not a chip dump).
 */
export const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Legs',
  'Glutes',
  'Core',
  'Full Body',
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const WORKOUT_TYPES = [
  'Strength',
  'Cardio',
  'HIIT',
  'Flexibility',
  'Swim',
  'Cycle',
  'Other',
] as const

export type WorkoutType = (typeof WORKOUT_TYPES)[number]

/** Body / session focus — multi-select */
export const FOCUS_AREAS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Arms',
  'Forearms',
  'Core',
  'Abs',
  'Legs',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Full Body',
  'Mobility',
] as const

export type FocusArea = (typeof FOCUS_AREAS)[number]

export const PROTEIN_PRESETS = [20, 25, 30, 40, 50] as const
export const CREATINE_PRESETS = [3, 5, 10] as const

export function parseFocusAreas(value: string | null | undefined): string[] {
  if (!value?.trim()) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function serializeFocusAreas(areas: string[]): string | null {
  if (!areas.length) return null
  return areas.join(',')
}

export function formatFocusAreas(value: string | null | undefined): string {
  return parseFocusAreas(value).join(' · ')
}

/** Canonical title for one-tap rest days (matches log wizard Rest split). */
export const REST_WORKOUT = 'Rest'

export function isRestLog(workout: string | null | undefined): boolean {
  const w = workout?.trim().toLowerCase()
  return w === 'rest' || w === 'rest day'
}

export function parseGrams(value: string): number | null {
  const t = value.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 10) / 10
}

export function formatGrams(value: number | null | undefined, unit = 'g'): string | null {
  if (value == null || Number.isNaN(value)) return null
  const rounded = Number.isInteger(value) ? String(value) : String(value)
  return `${rounded}${unit}`
}
