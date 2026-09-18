import { useCallback, useEffect, useState } from 'react'
import { toLocalDateString } from '../lib/dates'
import type { BodySectionData, BodySectionId } from './types'
import type { HealthState } from './useHealth'

/** Session cache: keyed by provider source, section, day and sync version. */
const cache = new Map<string, unknown>()

type SectionState<S extends BodySectionId> = {
  data: BodySectionData[S] | null
  loading: boolean
  error: string | null
  retry: () => void
}

/** Loads one Body tab section when connected; each section loads and fails independently. */
export function useBodySection<S extends BodySectionId>(health: HealthState, section: S): SectionState<S> {
  const { isConnected, provider, sync } = health
  const date = toLocalDateString()
  const key = `${health.source}:${section}:${date}:${health.syncVersion}`
  const [data, setData] = useState<BodySectionData[S] | null>(() => (cache.get(key) as BodySectionData[S]) ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!isConnected) return
    const cached = cache.get(key) as BodySectionData[S] | undefined
    if (cached && attempt === 0) {
      setData(cached)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    provider
      .getBodySection(section, date)
      .then((result) => {
        if (cancelled) return
        cache.set(key, result)
        setData(result)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // Expired grant: a sync re-reads the connection so the page shows Reconnect
        if (e instanceof Error && e.name === 'HealthExpiredError') void sync()
        setError(e instanceof Error ? e.message : "Couldn't reach Fitbit")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isConnected, provider, sync, key, section, date, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { data, loading, error, retry }
}
