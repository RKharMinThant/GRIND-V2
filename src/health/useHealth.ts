import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, toLocalDateString } from '../lib/dates'
import type { Log } from '../types/database'
import { createGoogleProvider } from './googleProvider'
import type { HealthProvider } from './provider'
import { createMockProvider } from './mockProvider'
import { readJson, writeJson } from './storage'
import type {
  DailySteps,
  HealthConnection,
  HealthRecovery,
  HealthSource,
  HealthWorkout,
  TodaySummary,
} from './types'

const DISMISSED_KEY = 'grind_health_dismissed'
const DISMISSED_MAX = 50
/** Covers the 16-week heatmap plus alignment to Sunday. */
const RANGE_DAYS = 120

export type HealthState = {
  enabled: boolean
  source: HealthSource
  /** null while the first check runs, or when disabled */
  connection: HealthConnection | null
  /** enabled && connection.status === 'connected' */
  isConnected: boolean
  workouts: HealthWorkout[]
  recovery: HealthRecovery | null
  steps: DailySteps[]
  today: TodaySummary | null
  /** Increments on every sync so Body sections refetch */
  syncVersion: number
  provider: HealthProvider
  loading: boolean
  connecting: boolean
  error: string | null
  dismissedIds: string[]
  connect(): Promise<void>
  disconnect(): Promise<void>
  sync(): Promise<void>
  dismiss(workoutId: string): void
}

export function useHealth(enabled: boolean, logs: Log[], logsLoading: boolean): HealthState {
  const logsRef = useRef(logs)
  useEffect(() => {
    logsRef.current = logs
  }, [logs])

  // The one place that chooses the provider: VITE_HEALTH_PROVIDER=google for real data, else demo.
  const provider = useMemo(
    () =>
      import.meta.env.VITE_HEALTH_PROVIDER === 'google'
        ? createGoogleProvider()
        : createMockProvider({ getLogs: () => logsRef.current }),
    [],
  )

  const [connection, setConnection] = useState<HealthConnection | null>(null)
  const [workouts, setWorkouts] = useState<HealthWorkout[]>([])
  const [recovery, setRecovery] = useState<HealthRecovery | null>(null)
  const [steps, setSteps] = useState<DailySteps[]>([])
  const [today, setToday] = useState<TodaySummary | null>(null)
  const [syncVersion, setSyncVersion] = useState(0)
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissedIds, setDismissedIds] = useState<string[]>(() =>
    readJson<string[]>(DISMISSED_KEY, []),
  )

  const sync = useCallback(async () => {
    const today = toLocalDateString()
    const from = addDays(today, -RANGE_DAYS)
    setLoading(true)
    setError(null)
    try {
      const [w, r, s, t] = await Promise.all([
        provider.getWorkouts(from, today),
        provider.getRecovery(today),
        provider.getDailySteps(from, today),
        provider.getToday(today),
      ])
      await provider.markSynced()
      setWorkouts(w)
      setRecovery(r)
      setSteps(s)
      setToday(t)
      setSyncVersion((v) => v + 1)
      setConnection(await provider.getConnection())
    } catch (e) {
      // Expired or disconnected elsewhere: show Reconnect instead of an error card
      const latest = await provider.getConnection().catch(() => null)
      if (latest && latest.status !== 'connected') {
        setConnection(latest)
        setError(null)
      } else {
        setError(e instanceof Error ? e.message : "Couldn't reach Fitbit")
      }
    } finally {
      setLoading(false)
    }
  }, [provider])

  // First check once logs are ready (mock workouts are derived from log dates).
  useEffect(() => {
    if (!enabled || logsLoading) return
    let cancelled = false
    provider
      .getConnection()
      .then((c) => {
        if (cancelled) return
        setConnection(c)
        if (c.status === 'connected') void sync()
      })
      .catch(() => {
        // e.g. migration 014 not applied yet — treat as not connected
        if (!cancelled) setConnection({ status: 'disconnected', lastSyncedAt: null, source: provider.source })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, logsLoading, provider, sync])

  // Phones suspend the app: when it returns (or the network does), retry a failed sync
  useEffect(() => {
    if (!enabled || !error || connection?.status !== 'connected') return
    const retry = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    document.addEventListener('visibilitychange', retry)
    window.addEventListener('online', retry)
    return () => {
      document.removeEventListener('visibilitychange', retry)
      window.removeEventListener('online', retry)
    }
  }, [enabled, error, connection?.status, sync])

  const connect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      await provider.connect()
      setConnection(await provider.getConnection())
      await sync()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect')
    } finally {
      setConnecting(false)
    }
  }, [provider, sync])

  const disconnect = useCallback(async () => {
    await provider.disconnect()
    setConnection(await provider.getConnection())
    setWorkouts([])
    setRecovery(null)
    setSteps([])
    setToday(null)
    setError(null)
  }, [provider])

  const dismiss = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, DISMISSED_MAX)
      writeJson(DISMISSED_KEY, next)
      return next
    })
  }, [])

  return {
    enabled,
    source: provider.source,
    connection: enabled ? connection : null,
    isConnected: enabled && connection?.status === 'connected',
    workouts,
    recovery,
    steps,
    today,
    syncVersion,
    provider,
    loading,
    connecting,
    error,
    dismissedIds,
    connect,
    disconnect,
    sync,
    dismiss,
  }
}
