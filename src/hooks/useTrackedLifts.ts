import { useCallback, useEffect, useMemo, useState } from 'react'
import { createId } from '../lib/id'
import { volumeOf, type LiftHistoryPoint } from '../lib/overload'
import { supabase } from '../lib/supabase'
import {
  MUSCLE_GROUPS,
  parseSetsDetail,
  summarizeSets,
  type LiftSet,
  type TrackedLift,
  type TrackedLiftInput,
} from '../types/database'

function resolveInputSets(input: TrackedLiftInput): LiftSet[] {
  if (input.sets_detail && input.sets_detail.length) {
    return input.sets_detail.map((s) => ({
      reps: Math.max(0, Math.floor(s.reps)),
      weight: Math.max(0, Number(s.weight) || 0),
    }))
  }
  const sets = Math.max(0, Math.floor(input.sets ?? 0))
  const reps = Math.max(0, Math.floor(input.reps ?? 0))
  const weight = Math.max(0, Number(input.weight) || 0)
  if (sets === 0) return []
  return Array.from({ length: sets }, () => ({ reps, weight }))
}

function setsEqual(a: LiftSet[], b: LiftSet[]): boolean {
  if (a.length !== b.length) return false
  return a.every((s, i) => s.reps === b[i].reps && s.weight === b[i].weight)
}

function normalize(row: TrackedLift): TrackedLift {
  const sets_detail = parseSetsDetail(row.sets_detail, {
    sets: row.sets,
    reps: row.reps,
    weight: Number(row.weight),
  })
  const summary = summarizeSets(sets_detail)
  const prev_sets_detail =
    row.prev_sets_detail != null
      ? parseSetsDetail(row.prev_sets_detail)
      : row.prev_sets != null && row.prev_reps != null && row.prev_weight != null
        ? parseSetsDetail(null, {
            sets: row.prev_sets,
            reps: row.prev_reps,
            weight: Number(row.prev_weight),
          })
        : null

  return {
    ...row,
    sets: summary.sets || row.sets,
    reps: summary.reps || row.reps,
    weight: summary.weight || Number(row.weight),
    prev_weight: row.prev_weight != null ? Number(row.prev_weight) : null,
    unit: row.unit === 'lb' ? 'lb' : 'kg',
    sets_detail,
    prev_sets_detail: prev_sets_detail && prev_sets_detail.length ? prev_sets_detail : null,
  }
}

export function useTrackedLifts(userId: string | undefined) {
  const [lifts, setLifts] = useState<TrackedLift[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!userId) {
      setLifts([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('tracked_lifts')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('updated_at', { ascending: false })

    if (err) {
      if (/tracked_lifts|schema cache|does not exist/i.test(err.message)) {
        setLifts([])
        setError(null)
      } else {
        setError(err.message)
        setLifts([])
      }
      setLoading(false)
      return
    }

    setLifts(((data as TrackedLift[]) ?? []).map(normalize))
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const byMuscle = useMemo(() => {
    const map = new Map<string, TrackedLift[]>()
    for (const lift of lifts) {
      const key = lift.muscle_group || 'Other'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(lift)
    }

    const ordered: { group: string; lifts: TrackedLift[] }[] = []
    for (const g of MUSCLE_GROUPS) {
      const list = map.get(g)
      if (list?.length) ordered.push({ group: g, lifts: list })
      map.delete(g)
    }
    for (const [group, list] of map) {
      if (list.length) ordered.push({ group, lifts: list })
    }
    return ordered
  }, [lifts])

  const recordHistory = useCallback(
    async (liftId: string, sets_detail: LiftSet[], unit: string, recordedAt?: string) => {
      if (!userId) return
      const volume = volumeOf(sets_detail)
      const { error: err } = await supabase.from('lift_history').insert({
        id: createId(),
        user_id: userId,
        lift_id: liftId,
        sets_detail,
        unit,
        volume,
        recorded_at: recordedAt ?? new Date().toISOString(),
      })
      // Table optional until migration 008
      if (err && !/lift_history|schema cache|does not exist/i.test(err.message)) {
        console.warn('lift_history insert', err.message)
      }
    },
    [userId],
  )

  const fetchHistory = useCallback(
    async (liftId: string, limit = 24): Promise<LiftHistoryPoint[]> => {
      if (!userId) return []
      const { data, error: err } = await supabase
        .from('lift_history')
        .select('*')
        .eq('user_id', userId)
        .eq('lift_id', liftId)
        .order('recorded_at', { ascending: true })
        .limit(limit)

      if (err || !data) return []
      return (data as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        lift_id: String(row.lift_id),
        sets_detail: parseSetsDetail(row.sets_detail),
        unit: row.unit === 'lb' ? 'lb' : 'kg',
        volume: Number(row.volume) || 0,
        recorded_at: String(row.recorded_at),
      }))
    },
    [userId],
  )

  const addLift = useCallback(
    async (input: TrackedLiftInput) => {
      if (!userId) throw new Error('Not signed in')
      const name = input.exercise_name.trim()
      if (!name) throw new Error('Exercise name is required')

      const sets_detail = resolveInputSets(input)
      if (!sets_detail.length) throw new Error('Add at least one set')
      const summary = summarizeSets(sets_detail)
      const unit = input.unit === 'lb' ? 'lb' : 'kg'
      const now = new Date().toISOString()

      const row = {
        id: createId(),
        user_id: userId,
        muscle_group: input.muscle_group.trim() || 'Chest',
        exercise_name: name,
        sets: summary.sets,
        reps: summary.reps,
        weight: summary.weight,
        unit,
        sets_detail,
        prev_sets: null as number | null,
        prev_reps: null as number | null,
        prev_weight: null as number | null,
        prev_sets_detail: null as LiftSet[] | null,
        sort_order: lifts.filter((l) => l.muscle_group === input.muscle_group).length,
        updated_at: now,
      }

      let { data, error: err } = await supabase.from('tracked_lifts').insert(row).select().single()

      if (err && /sets_detail|prev_sets_detail/i.test(err.message)) {
        const { sets_detail: _d, prev_sets_detail: _p, ...legacy } = row
        const retry = await supabase.from('tracked_lifts').insert(legacy).select().single()
        data = retry.data
        err = retry.error
      }

      if (err) {
        if (/tracked_lifts|schema cache|does not exist/i.test(err.message)) {
          throw new Error('Run migration 006_tracked_lifts.sql in Supabase to enable the Progress board.')
        }
        if (/sets_detail/i.test(err.message)) {
          throw new Error('Run migration 007_lift_sets_detail.sql in Supabase for per-set tracking.')
        }
        throw err
      }

      const created = normalize(data as TrackedLift)
      await recordHistory(created.id, sets_detail, unit, now)
      setLifts((prev) => [...prev, created])
      return created
    },
    [userId, lifts, recordHistory],
  )

  const updateLift = useCallback(
    async (id: string, input: TrackedLiftInput) => {
      if (!userId) throw new Error('Not signed in')
      const existing = lifts.find((l) => l.id === id)
      if (!existing) throw new Error('Lift not found')

      const name = input.exercise_name.trim()
      if (!name) throw new Error('Exercise name is required')

      const sets_detail = resolveInputSets(input)
      if (!sets_detail.length) throw new Error('Add at least one set')
      const summary = summarizeSets(sets_detail)
      const nextUnit = input.unit === 'lb' ? 'lb' : 'kg'
      const nextMuscle = input.muscle_group.trim() || existing.muscle_group

      const prevDetail = existing.sets_detail?.length
        ? existing.sets_detail
        : parseSetsDetail(null, {
            sets: existing.sets,
            reps: existing.reps,
            weight: Number(existing.weight),
          })

      const metricsChanged =
        !setsEqual(sets_detail, prevDetail) || nextUnit !== existing.unit

      const patch: Record<string, unknown> = {
        muscle_group: nextMuscle,
        exercise_name: name,
        sets: summary.sets,
        reps: summary.reps,
        weight: summary.weight,
        unit: nextUnit,
        sets_detail,
        updated_at: new Date().toISOString(),
      }

      if (metricsChanged) {
        patch.prev_sets = existing.sets
        patch.prev_reps = existing.reps
        patch.prev_weight = Number(existing.weight)
        patch.prev_sets_detail = prevDetail
      }

      let { data, error: err } = await supabase
        .from('tracked_lifts')
        .update(patch)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single()

      if (err && /sets_detail|prev_sets_detail/i.test(err.message)) {
        const {
          sets_detail: _d,
          prev_sets_detail: _p,
          ...legacy
        } = patch
        const retry = await supabase
          .from('tracked_lifts')
          .update(legacy)
          .eq('id', id)
          .eq('user_id', userId)
          .select()
          .single()
        data = retry.data
        err = retry.error
      }

      if (err) throw err
      const updated = normalize(data as TrackedLift)
      if (metricsChanged) {
        await recordHistory(id, sets_detail, nextUnit, String(patch.updated_at))
      }
      setLifts((prev) => prev.map((l) => (l.id === id ? updated : l)))
      return updated
    },
    [userId, lifts, recordHistory],
  )

  const removeLift = useCallback(
    async (id: string) => {
      if (!userId) throw new Error('Not signed in')
      const { error: err } = await supabase
        .from('tracked_lifts')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (err) throw err
      setLifts((prev) => prev.filter((l) => l.id !== id))
    },
    [userId],
  )

  return {
    lifts,
    byMuscle,
    loading,
    error,
    addLift,
    updateLift,
    removeLift,
    fetchHistory,
    refresh,
  }
}
