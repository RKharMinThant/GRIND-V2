import { useCallback, useEffect, useMemo, useState } from 'react'
import { createId } from '../lib/id'
import { deleteLogPhoto, getPhotoUrl, uploadLogPhoto } from '../lib/photos'
import { supabase } from '../lib/supabase'
import { calcStreakStats } from '../lib/streaks'
import { pickHealthFields } from '../health/logic'
import type { LogHealthFields } from '../health/types'
import type { Log, LogInsert, LogUpdate } from '../types/database'

const HEALTH_COLUMNS = [
  'health_source',
  'health_workout_id',
  'calories_kcal',
  'avg_hr',
  'max_hr',
  'hr_zone_minutes',
] as const satisfies readonly (keyof LogHealthFields)[]

const OPTIONAL_COLUMNS = ['focus_areas', 'protein_g', 'creatine_g', ...HEALTH_COLUMNS] as const

function normalizeLog(row: Log, overrides?: Partial<Log>): Log {
  return {
    ...row,
    ...pickHealthFields(row),
    focus_areas: overrides?.focus_areas ?? row.focus_areas ?? null,
    protein_g: overrides?.protein_g ?? row.protein_g ?? null,
    creatine_g: overrides?.creatine_g ?? row.creatine_g ?? null,
  }
}

/** Friendly message for the partial unique index on (user_id, health_workout_id). */
function healthDuplicateError(err: { code?: string; message: string }): Error | null {
  return err.code === '23505' && /health_workout/i.test(err.message)
    ? new Error('That workout is already logged')
    : null
}

/** Health values that were actually sent (columns stripped for missing migrations are dropped). */
function sentHealthFields(row: Record<string, unknown>): Partial<LogHealthFields> {
  return Object.fromEntries(HEALTH_COLUMNS.filter((c) => c in row).map((c) => [c, row[c]]))
}

/** Drop optional columns mentioned in a Postgres/PostgREST error and retry. */
function stripMissingColumns<T extends Record<string, unknown>>(
  row: T,
  message: string,
): T | null {
  let changed = false
  const next = { ...row }
  for (const col of OPTIONAL_COLUMNS) {
    if (new RegExp(col, 'i').test(message) && col in next) {
      delete next[col]
      changed = true
    }
  }
  return changed ? next : null
}

export function useLogs(userId: string | undefined) {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    if (!userId) {
      setLogs([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('logs')
      .select('*')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (err) {
      setError(err.message)
      setLogs([])
    } else {
      setLogs(((data as Log[]) ?? []).map((l) => normalizeLog(l)))
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      const next: Record<string, string> = {}
      await Promise.all(
        logs
          .filter((l) => l.photo_path)
          .map(async (l) => {
            if (photoUrls[l.id]) {
              next[l.id] = photoUrls[l.id]
              return
            }
            const url = await getPhotoUrl(l.photo_path)
            if (url) next[l.id] = url
          }),
      )
      if (!cancelled) setPhotoUrls((prev) => ({ ...prev, ...next }))
    }
    void resolve()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs])

  const stats = useMemo(
    () => calcStreakStats(logs.map((l) => l.log_date)),
    [logs],
  )

  const createLog = useCallback(
    async (input: LogInsert, photoFile?: File | null) => {
      if (!userId) throw new Error('Not signed in')

      const id = createId()
      let photo_path: string | null = input.photo_path ?? null

      if (photoFile) {
        photo_path = await uploadLogPhoto(userId, id, photoFile)
      }

      let row: Record<string, unknown> = {
        id,
        user_id: userId,
        log_date: input.log_date,
        workout: input.workout,
        workout_type: input.workout_type ?? null,
        focus_areas: input.focus_areas ?? null,
        duration: input.duration ?? null,
        meal: input.meal ?? null,
        notes: input.notes ?? null,
        protein_g: input.protein_g ?? null,
        creatine_g: input.creatine_g ?? null,
        photo_path,
        health_source: input.health_source ?? null,
        health_workout_id: input.health_workout_id ?? null,
        calories_kcal: input.calories_kcal ?? null,
        avg_hr: input.avg_hr ?? null,
        max_hr: input.max_hr ?? null,
        hr_zone_minutes: input.hr_zone_minutes ?? null,
      }

      let { data, error: err } = await supabase.from('logs').insert(row).select().single()

      // Retry without optional columns if migrations not applied
      while (err) {
        const stripped = stripMissingColumns(row, err.message)
        if (!stripped) break
        row = stripped
        const retry = await supabase.from('logs').insert(row).select().single()
        data = retry.data
        err = retry.error
      }

      if (err) {
        if (photo_path) await deleteLogPhoto(photo_path)
        throw healthDuplicateError(err) ?? err
      }

      const created = normalizeLog({ ...(data as Log), ...sentHealthFields(row) }, {
        focus_areas: input.focus_areas ?? null,
        protein_g: input.protein_g ?? null,
        creatine_g: input.creatine_g ?? null,
      })
      setLogs((prev) => [created, ...prev])
      return created
    },
    [userId],
  )

  const updateLog = useCallback(
    async (id: string, input: LogUpdate, photoFile?: File | null, removePhoto = false) => {
      if (!userId) throw new Error('Not signed in')
      const existing = logs.find((l) => l.id === id)
      if (!existing) throw new Error('Log not found')

      let photo_path = existing.photo_path

      if (removePhoto && photo_path) {
        await deleteLogPhoto(photo_path)
        photo_path = null
      }

      if (photoFile) {
        if (photo_path) await deleteLogPhoto(photo_path)
        photo_path = await uploadLogPhoto(userId, id, photoFile)
      }

      const focus_areas =
        input.focus_areas !== undefined ? input.focus_areas : existing.focus_areas ?? null
      const protein_g =
        input.protein_g !== undefined ? input.protein_g : existing.protein_g ?? null
      const creatine_g =
        input.creatine_g !== undefined ? input.creatine_g : existing.creatine_g ?? null

      let patch: Record<string, unknown> = {
        log_date: input.log_date ?? existing.log_date,
        workout: input.workout ?? existing.workout,
        workout_type: input.workout_type !== undefined ? input.workout_type : existing.workout_type,
        focus_areas,
        duration: input.duration !== undefined ? input.duration : existing.duration,
        meal: input.meal !== undefined ? input.meal : existing.meal,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        protein_g,
        creatine_g,
        photo_path,
      }
      for (const col of HEALTH_COLUMNS) {
        patch[col] = input[col] !== undefined ? input[col] : (existing[col] ?? null)
      }

      let { data, error: err } = await supabase
        .from('logs')
        .update(patch)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single()

      while (err) {
        const stripped = stripMissingColumns(patch, err.message)
        if (!stripped) break
        patch = stripped
        const retry = await supabase
          .from('logs')
          .update(patch)
          .eq('id', id)
          .eq('user_id', userId)
          .select()
          .single()
        data = retry.data
        err = retry.error
      }

      if (err) throw healthDuplicateError(err) ?? err
      const updated = normalizeLog(
        { ...(data as Log), ...sentHealthFields(patch) },
        { focus_areas, protein_g, creatine_g },
      )
      setLogs((prev) => prev.map((l) => (l.id === id ? updated : l)))
      if (photoFile || removePhoto) {
        setPhotoUrls((prev) => {
          const copy = { ...prev }
          delete copy[id]
          return copy
        })
      }
      return updated
    },
    [userId, logs],
  )

  const removeLog = useCallback(
    async (id: string) => {
      if (!userId) throw new Error('Not signed in')
      const existing = logs.find((l) => l.id === id)
      const { error: err } = await supabase.from('logs').delete().eq('id', id).eq('user_id', userId)
      if (err) throw err
      if (existing?.photo_path) await deleteLogPhoto(existing.photo_path)
      setLogs((prev) => prev.filter((l) => l.id !== id))
      setPhotoUrls((prev) => {
        const copy = { ...prev }
        delete copy[id]
        return copy
      })
    },
    [userId, logs],
  )

  return {
    logs,
    loading,
    error,
    stats,
    photoUrls,
    refresh,
    createLog,
    updateLog,
    removeLog,
  }
}
