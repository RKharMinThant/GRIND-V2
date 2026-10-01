import { useCallback, useEffect, useRef, useState } from 'react'
import { currentWeekStart, fetchGrindAge, readCachedGrindAge, writeCachedGrindAge, type GrindAgeResponse } from '../health/grindAge'
import { toLocalDateString } from '../lib/dates'

export type GrindAgeState = {
  data: GrindAgeResponse | null
  loading: boolean
  error: string | null
  /** Recompute now — after a new measurement or a birth date / sex change. */
  /** Resolves true when the recompute came back with a finished reading. */
  refresh: () => Promise<boolean>
}

/**
 * GRIND Age for the signed-in user. Shows the saved reading instantly and only asks the
 * server when there is none or it is from a previous week.
 */
export function useGrindAge(userId: string | undefined, enabled: boolean): GrindAgeState {
  const [data, setData] = useState<GrindAgeResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Drops an answer that arrives after sign-out or an account switch. */
  const current = useRef<string | undefined>(undefined)
  current.current = enabled ? userId : undefined

  const load = useCallback(
    async (refresh: boolean): Promise<boolean> => {
      if (!userId || !enabled) return false
      setLoading(true)
      setError(null)
      try {
        const response = await fetchGrindAge(refresh)
        if (current.current !== userId) return false
        writeCachedGrindAge(userId, response)
        setData(response)
        return response.status === 'ok'
      } catch (e) {
        if (current.current !== userId) return false
        setError(e instanceof Error ? e.message : 'Could not load GRIND Age')
        return false
      } finally {
        if (current.current === userId) setLoading(false)
      }
    },
    [userId, enabled],
  )

  useEffect(() => {
    if (!userId || !enabled) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    const cached = readCachedGrindAge(userId)
    setData(cached)
    if (!cached || cached.weekStart !== currentWeekStart(toLocalDateString())) void load(false)
    else setLoading(false)
  }, [userId, enabled, load])

  // Left open across Monday: pick up the new week when the app comes back to the foreground
  useEffect(() => {
    if (!userId || !enabled) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const cached = readCachedGrindAge(userId)
      if (!cached || cached.weekStart !== currentWeekStart(toLocalDateString())) void load(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [userId, enabled, load])

  const refresh = useCallback(() => load(true), [load])

  return { data, loading, error, refresh }
}
