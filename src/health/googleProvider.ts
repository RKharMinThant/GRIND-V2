import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { functionErrorMessage, isAuthFailure, type FunctionErrorPayload } from './functionError'
import type { HealthProvider } from './provider'
import type {
  BodySectionData,
  BodySectionId,
  DailySteps,
  HealthConnection,
  HealthRecovery,
  HealthWorkout,
  TodaySummary,
} from './types'

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
  today: TodaySummary | null
  lastSyncedAt: string
}

/**
 * Calls an Edge Function with the current Supabase login.
 *
 * Phones suspend the app, so its access token is often stale on resume and the
 * gateway answers 401 ("Invalid JWT"). Refresh once and retry before surfacing that.
 */
async function invoke<T>(name: string, body?: unknown, isRetry = false): Promise<T> {
  // Returns a fresh token when the current one is expiring
  await supabase.auth.getSession()

  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} })
  if (!error) return data as T

  if (error instanceof FunctionsHttpError) {
    const status = error.context.status
    const payload = (await error.context.json().catch(() => null)) as FunctionErrorPayload
    if (status === 409) throw new HealthExpiredError()
    if (!isRetry && isAuthFailure(status, payload)) {
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (!refreshError) return invoke<T>(name, body, true)
      throw new Error('Your session expired — sign in again')
    }
    throw new Error(functionErrorMessage(status, payload))
  }
  throw new Error("Couldn't reach Fitbit")
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

    async getToday(date) {
      // Reuse the sync's request when it ends on this date
      if (inflight && inflight.to === date && Date.now() - inflight.at < 5_000) {
        return (await inflight.promise).today ?? null
      }
      return (await bundle(date, date)).today ?? null
    },

    async getBodySection<S extends BodySectionId>(section: S, date: string) {
      return invoke<BodySectionData[S]>('health-body', {
        section,
        date,
        tzOffsetMin: -new Date().getTimezoneOffset(),
      })
    },
  }
}
