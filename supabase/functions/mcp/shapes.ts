// Output shapes. user_id and photo_path are never emitted.
import { num, truncate } from './common.ts'
import {
  bestOneRepMax,
  durationMinutes,
  isRest,
  type LiftSet,
  parseFocusAreas,
  parseSetsDetail,
  round1,
  volumeOf,
} from './domain.ts'

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>

export function toLog(r: Row, opts: { list?: boolean } = {}) {
  let notes: string | null = r.notes ?? null
  let meal: string | null = r.meal ?? null
  let cut = false
  if (opts.list) {
    const n = truncate(notes)
    const m = truncate(meal)
    notes = n.text
    meal = m.text
    cut = n.cut || m.cut
  }
  const zones = r.hr_zone_minutes as { fatBurn?: number; cardio?: number; peak?: number } | null
  return {
    id: r.id as string,
    date: r.log_date as string,
    workout: r.workout as string,
    is_rest: isRest(r.workout),
    type: (r.workout_type as string | null) ?? null,
    focus_areas: parseFocusAreas(r.focus_areas),
    duration: (r.duration as string | null) ?? null,
    duration_minutes: durationMinutes(r.duration),
    meal,
    notes,
    ...(cut ? { notes_truncated: true as const } : {}),
    protein_g: num(r.protein_g),
    creatine_g: num(r.creatine_g),
    has_photo: r.photo_path != null,
    fitbit: r.health_workout_id == null
      ? null
      : {
        workout_id: r.health_workout_id as string,
        source: (r.health_source ?? 'google_health') as 'google_health' | 'demo',
        calories_kcal: num(r.calories_kcal),
        avg_hr: num(r.avg_hr),
        max_hr: num(r.max_hr),
        zone_minutes: zones
          ? { fat_burn: zones.fatBurn ?? 0, cardio: zones.cardio ?? 0, peak: zones.peak ?? 0 }
          : null,
      },
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }
}

const cleanSets = (sets: LiftSet[]): LiftSet[] => sets.map((s) => ({ reps: s.reps, weight: round1(s.weight) }))

/** Mirrors useTrackedLifts.normalize. */
export function normalizeLift(r: Row) {
  const sets = parseSetsDetail(r.sets_detail, { sets: r.sets, reps: r.reps, weight: Number(r.weight) })
  let previous: LiftSet[] | null = null
  if (Array.isArray(r.prev_sets_detail) && r.prev_sets_detail.length) {
    previous = parseSetsDetail(r.prev_sets_detail)
  } else if (r.prev_sets != null && r.prev_reps != null && r.prev_weight != null) {
    previous = parseSetsDetail(null, { sets: r.prev_sets, reps: r.prev_reps, weight: Number(r.prev_weight) })
  }
  return {
    id: r.id as string,
    name: r.exercise_name as string,
    muscle_group: r.muscle_group as string,
    unit: (r.unit === 'lb' ? 'lb' : 'kg') as 'kg' | 'lb',
    sets,
    previous_sets: previous && previous.length ? previous : null,
    updated_at: r.updated_at as string,
    created_at: r.created_at as string,
  }
}
export type NormalLift = ReturnType<typeof normalizeLift>

export function toLift(r: Row) {
  const l = normalizeLift(r)
  return {
    id: l.id,
    name: l.name,
    muscle_group: l.muscle_group,
    unit: l.unit,
    sets: cleanSets(l.sets),
    est_1rm: bestOneRepMax(l.sets),
    volume: round1(volumeOf(l.sets)),
    previous_sets: l.previous_sets ? cleanSets(l.previous_sets) : null,
    last_changed_at: l.updated_at,
    created_at: l.created_at,
  }
}

export function toMeasurement(r: Row) {
  return {
    id: r.id as string,
    date: r.measured_on as string,
    weight_kg: Number(r.weight_kg),
    body_fat_pct: num(r.body_fat_pct),
    created_at: r.created_at as string,
  }
}
