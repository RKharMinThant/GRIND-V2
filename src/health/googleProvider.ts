import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { HealthProvider } from './provider'
import type { DailySteps, HealthConnection, HealthRecovery, HealthWorkout } from './types'

/** The stored Google grant expired or was revoked — the user must reconnect. */
export class HealthExpiredError extends Error {
  constructor() {
    super('Fitbit connection expired')
    this.name = 'HealthExpiredError'
  }
}

type Bundle = {
  workouts: HealthWorkout[]
  recovery: HealthRecovery | null
  steps: DailySteps[]
  lastSyncedAt: string
}

async function invoke<T>(name: string, body?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const status = error.context.status
      const payload = await error.context.json().catch(() => ({}))
      if (status === 409) throw new HealthExpiredError()
      throw new Error(payload?.detail || payload?.error || `Fitbit request failed (${status})`)
    }
    throw new Error("Couldn't reach Fitbit")
  }
  return data as T
}

/**
 * Real data via Supabase Edge Functions (see supabase/functions/health-*).
 * The three data methods share one health-data request per range, so a sync is a single call.
 */
export function createGoogleProvider(): HealthProvider {
  let inflight: { key: string; to: string; promise: Promise<Bundle>; at: number } | null = null

  function bundle(from: string, to: string): Promise<Bundle> {
    const key = `${from}:${to}`
    if (inflight && inflight.key === key && Date.now() - inflight.at < 5_000) return inflight.promise
    const promise = invoke<Bundle>('health-data', { from, to })
    inflight = { key, to, promise, at: Date.now() }
    promise.catch(() => {
      if (inflight?.promise === promise) inflight = null
    })
    return promise
  }

  return {
    source: 'google_health',

    async getConnection(): Promise<HealthConnection> {
      const { data, error } = await supabase.rpc('health_connection_status')
      if (error) throw new Error(error.message)
      const row = (data as { status: 'connected' | 'expired'; last_synced_at: string | null }[] | null)?.[0]
      return row
        ? { status: row.status, lastSyncedAt: row.last_synced_at, source: 'google_health' }
        : { status: 'disconnected', lastSyncedAt: null, source: 'google_health' }
    },

    async connect() {
      const { url } = await invoke<{ url: string }>('health-oauth-start', {
        returnTo: window.location.origin,
      })
      window.location.assign(url)
      // The page navigates away to Google's consent screen.
      await new Promise(() => {})
    },

    async disconnect() {
      await invoke('health-disconnect')
      inflight = null
    },

    async getWorkouts(from, to) {
      return (await bundle(from, to)).workouts
    },

    async getDailySteps(from, to) {
      return (await bundle(from, to)).steps
    },

    async getRecovery(date) {
      // Reuse the sync's request when it ends on this date
      if (inflight && inflight.to === date && Date.now() - inflight.at < 5_000) {
        return (await inflight.promise).recovery
      }
      const from = new Date(Date.parse(`${date}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10)
      return (await bundle(from, date)).recovery
    },

    async markSynced() {
      // health-data records last_synced_at server-side
    },
  }
}
