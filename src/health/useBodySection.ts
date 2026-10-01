import { useCallback, useEffect, useRef, useState } from 'react'
import { toLocalDateString } from '../lib/dates'
import { readSection, writeSection } from './cache'
import type { BodySectionData, BodySectionId } from './types'
import type { HealthState } from './useHealth'

type SectionState<S extends BodySectionId> = {
  data: BodySectionData[S] | null
  loading: boolean
  error: string | null
  retry: () => void
}

/**
 * Loads one Body tab section when connected; each section loads and fails independently.
 *
 * Shows the section saved on this device first, so the tab never opens to skeletons once
 * it has loaded before. It fetches only when that copy predates the latest sync — and
 * waits for a sync in progress rather than loading now and again straight after.
 */
export function useBodySection<S extends BodySectionId>(health: HealthState, section: S): SectionState<S> {
  const { isConnected, provider, sync, userId, lastSyncAt, source } = health
  const syncing = health.loading
  const syncFailed = Boolean(health.error)
  const date = toLocalDateString()

  const [initial] = useState(() => readSection(userId, source, section, date))
  const [data, setData] = useState<BodySectionData[S] | null>(initial?.data ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  /** savedAt of the copy on screen, so re-reading storage doesn't re-render for nothing */
  const shownAt = useRef<number | null>(initial?.savedAt ?? null)

  useEffect(() => {
    if (!isConnected || !userId) return

    const cached = readSection(userId, source, section, date)
    if (cached && shownAt.current !== cached.savedAt) {
      shownAt.current = cached.savedAt
      setData(cached.data)
    } else if (!cached && shownAt.current !== null) {
      // Nothing saved for today (e.g. just past midnight): a skeleton beats yesterday's
      // chart under today's heading
      shownAt.current = null
      setData(null)
    }

    // A sync is running: fetch once it lands, not now and again after
    if (syncing) return
    // No sync has completed yet this session (nor a saved one): it will bump lastSyncAt.
    // If it failed, load anyway so the section can show its own error and retry.
    if (lastSyncAt === 0 && !syncFailed && attempt === 0) return

    const current = cached && cached.savedAt >= lastSyncAt && attempt === 0
    if (current) {
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
        const savedAt = Date.now()
        writeSection(userId, source, section, date, result, savedAt)
        shownAt.current = savedAt
        setData(result)
        setLoading(false)
        // A retry has done its job; later runs go back to "only when stale". Reset last:
        // it re-runs this effect, which marks this run cancelled.
        if (attempt > 0) setAttempt(0)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // Expired grant: a sync re-reads the connection so the page shows Reconnect
        if (e instanceof Error && e.name === 'HealthExpiredError') void sync()
        setError(e instanceof Error ? e.message : "Couldn't reach Fitbit")
        setLoading(false)
      })
    return () => {
      cancelled = true
      // A cancelled fetch never reaches its own setLoading(false); the next run sets it
      // again if it fetches
      setLoading(false)
    }
  }, [isConnected, userId, source, provider, sync, section, date, syncing, syncFailed, lastSyncAt, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { data, loading, error, retry }
}
