import { addDays, parseLocalDate, toLocalDateString } from '../lib/dates'
import { isRestLog } from '../types/database'
import type { HealthProvider } from './provider'
import { readJson, safeLocalStorage, writeJson } from './storage'
import type { DailySteps, HealthConnection, HealthRecovery, HealthWorkout } from './types'

const CONN_KEY = 'grind_health_demo_connection'

type Stored = { lastSyncedAt: string | null }

/** Deterministic 0..1 generator seeded by a string (FNV-1a hash → mulberry32). */
function rng(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const between = (r: () => number, lo: number, hi: number) => Math.round(lo + r() * (hi - lo))

function datesInRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

function workoutFor(date: string): HealthWorkout {
  const r = rng(`workout:${date}`)
  const pick = r()
  const activity = pick < 0.6 ? 'Weights' : pick < 0.78 ? 'Run' : pick < 0.9 ? 'HIIT' : 'Walk'
  const durationMin = between(r, 30, 90)
  const startMin = between(r, 6 * 60, 8 * 60)
  const day = parseLocalDate(date)
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, startMin)
  const end = new Date(start.getTime() + durationMin * 60_000)
  const avgHr = between(r, 105, 150)
  const peak = between(r, 0, Math.round(durationMin * 0.1))
  const cardio = between(r, 5, Math.round(durationMin * 0.35))
  return {
    id: `demo-${date}`,
    start: start.toISOString(),
    end: end.toISOString(),
    durationMin,
    activity,
    calories: between(r, 180, 650),
    avgHr,
    maxHr: avgHr + between(r, 20, 45),
    zoneMinutes: {
      fatBurn: Math.max(0, durationMin - cardio - peak - between(r, 0, 8)),
      cardio,
      peak,
    },
  }
}

function nightFor(date: string) {
  const r = rng(`night:${date}`)
  const sleepMin = between(r, 300, 510)
  const deep = Math.round(sleepMin * (0.12 + r() * 0.08))
  const rem = Math.round(sleepMin * (0.18 + r() * 0.07))
  const awake = Math.round(sleepMin * (0.04 + r() * 0.05))
  return {
    sleepMin,
    stages: { deep, rem, awake, light: sleepMin - deep - rem - awake },
    restingHr: between(r, 52, 66),
    hrvMs: between(r, 30, 70),
  }
}

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
      const n = now()
      // Today's count grows through the day
      const dayFraction = Math.min(1, (n.getHours() + n.getMinutes() / 60) / 21)
      return datesInRange(from, to).map((date): DailySteps => {
        const steps = between(rng(`steps:${date}`), 2000, 16000)
        return { date, steps: date === t ? Math.round(steps * dayFraction) : steps }
      })
    },
  }
}
