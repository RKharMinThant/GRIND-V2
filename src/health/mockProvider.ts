import { addDays, toLocalDateString } from '../lib/dates'
import { isRestLog } from '../types/database'
import type { HealthProvider } from './provider'
import { mockBodySection, mockToday } from './mockBody'
import { datesInRange, nightFor, stepsFor, workoutFor } from './mockSeed'
import { readJson, safeLocalStorage, writeJson } from './storage'
import type { DailySteps, HealthConnection, HealthRecovery } from './types'

const CONN_KEY = 'grind_health_demo_connection'

type Stored = { lastSyncedAt: string | null }

export type MockProviderDeps = {
  getLogs: () => { log_date: string; workout: string }[]
  storage?: Storage | null
  /** window.location.search — `?health=expired` previews the expired state */
  search?: string
  now?: () => Date
  connectDelayMs?: number
}

/** Seeded fake Fitbit data: stable across reloads, workouts on days you actually trained. */
export function createMockProvider(deps: MockProviderDeps): HealthProvider {
  const storage = deps.storage === undefined ? safeLocalStorage() : deps.storage
  const now = deps.now ?? (() => new Date())
  const search = deps.search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const delay = deps.connectDelayMs ?? 900
  const today = () => toLocalDateString(now())

  return {
    source: 'demo',

    async getConnection(): Promise<HealthConnection> {
      const stored = readJson<Stored | null>(CONN_KEY, null, storage)
      if (new URLSearchParams(search).get('health') === 'expired') {
        return { status: 'expired', lastSyncedAt: stored?.lastSyncedAt ?? null, source: 'demo' }
      }
      return stored
        ? { status: 'connected', lastSyncedAt: stored.lastSyncedAt, source: 'demo' }
        : { status: 'disconnected', lastSyncedAt: null, source: 'demo' }
    },

    async connect() {
      if (delay) await new Promise((res) => setTimeout(res, delay))
      writeJson(CONN_KEY, { lastSyncedAt: now().toISOString() } satisfies Stored, storage)
    },

    async disconnect() {
      writeJson(CONN_KEY, null, storage)
    },

    async markSynced() {
      if (readJson<Stored | null>(CONN_KEY, null, storage)) {
        writeJson(CONN_KEY, { lastSyncedAt: now().toISOString() } satisfies Stored, storage)
      }
    },

    async getWorkouts(from, to) {
      const trained = new Set(
        deps
          .getLogs()
          .filter((l) => !isRestLog(l.workout))
          .map((l) => l.log_date),
      )
      trained.add(today())
      return [...trained]
        .filter((d) => d >= from && d <= to)
        .sort()
        .map(workoutFor)
    },

    async getRecovery(date) {
      const night = nightFor(date)
      const prev = datesInRange(addDays(date, -7), addDays(date, -1)).map(nightFor)
      const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
      return {
        date,
        ...night,
        restingHrAvg: avg(prev.map((p) => p.restingHr)),
        hrvAvg: avg(prev.map((p) => p.hrvMs)),
      } satisfies HealthRecovery
    },

    async getDailySteps(from, to) {
      const t = today()
      return datesInRange(from, to).map((date): DailySteps => ({ date, steps: stepsFor(date, t, now()) }))
    },

    async getToday(date) {
      return mockToday(date, today(), now())
    },

    async getBodySection(section, date) {
      return mockBodySection(section, date, today(), now())
    },
  }
}
