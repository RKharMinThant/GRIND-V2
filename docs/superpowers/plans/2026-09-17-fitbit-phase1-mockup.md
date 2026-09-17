# Fitbit Integration — Phase 1 (Mockup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full Fitbit UI (connect row, workout-detected card, attach-to-log, saved stats, recovery card, steps heatmap) on deterministic mock data, visible to the admin account only.

**Architecture:** A `HealthProvider` interface with a seeded `mockProvider`; a `useHealth` hook is the only thing the UI reads. Pure rules live in `src/health/logic.ts` and are unit-tested with Vitest. Workout stats are saved onto `logs` via migration 013 and tagged `health_source = 'demo'`.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Supabase JS, Vitest (new dev dependency).

**Spec:** `docs/superpowers/specs/2026-09-17-fitbit-health-integration-design.md`

## Global Constraints

- Gating: `healthEnabled = isAdmin` (`user?.email === 'rkharmthant@gmail.com'`, already computed in `useAuth`).
- Live Fitbit UI renders only when `healthEnabled && connection.status === 'connected'`; stats saved on a log render regardless.
- Every `localStorage` read/write is wrapped in try/catch; the app must work when storage throws.
- Keys: `grind_health_demo_connection`, `grind_health_dismissed` (max 50 ids), `grind_heatmap_mode`.
- Readiness copy verbatim: "Recovery looks low — a rest day might pay off." / "Recovered — good day to train." Footnote: "Estimates from your tracker, not medical advice."
- Step tiers: `<5000` → `''`, `5000–7999` → `l1`, `8000–11999` → `l2`, `≥12000` → `l3`.
- Home order: greeting → hero → workout detected → recovery → week strip → metrics → heatmap → recent.
- CSS uses existing tokens only (`--surface`, `--border`, `--accent`, `--ice`, `--muted`, `--radius-lg`, …); must look right in light and dark.
- `npm run build` (tsc + vite) and `npm run lint` must pass after every task.

---

### Task 1: Health types, pure logic, Vitest

**Files:**
- Create: `src/health/types.ts`, `src/health/logic.ts`, `src/health/logic.test.ts`
- Modify: `package.json` (add `vitest`, `"test": "vitest run"`)

**Interfaces — Produces:**
```ts
// types.ts
export type HealthSource = 'demo' | 'google_health'
export type ZoneMinutes = { fatBurn: number; cardio: number; peak: number }
export type HealthWorkout = { id: string; start: string; end: string; durationMin: number; activity: string; calories: number | null; avgHr: number | null; maxHr: number | null; zoneMinutes: ZoneMinutes | null }
export type SleepStages = { deep: number; light: number; rem: number; awake: number }
export type HealthRecovery = { date: string; sleepMin: number | null; stages: SleepStages | null; restingHr: number | null; restingHrAvg: number | null; hrvMs: number | null; hrvAvg: number | null }
export type DailySteps = { date: string; steps: number }
export type HealthConnection = { status: 'disconnected' | 'connected' | 'expired'; lastSyncedAt: string | null; source: HealthSource }
export type LogHealthFields = { health_source: HealthSource | null; health_workout_id: string | null; calories_kcal: number | null; avg_hr: number | null; max_hr: number | null; hr_zone_minutes: ZoneMinutes | null }
export const EMPTY_HEALTH_FIELDS: LogHealthFields
// logic.ts
export type Readiness = 'low' | 'good' | 'unknown'
export function readiness(r: HealthRecovery | null): Readiness
export function activityToWorkoutType(activity: string): WorkoutType
export function stepTier(steps: number): '' | 'l1' | 'l2' | 'l3'
export function workoutLocalDate(w: Pick<HealthWorkout, 'start'>): string
export function unlinkedWorkouts(workouts: HealthWorkout[], logs: { health_workout_id?: string | null }[], dismissedIds: string[], today: string): HealthWorkout[]
export function roundDurationToOptions(min: number): { hours: number; minutes: number }
export function workoutToHealthFields(w: HealthWorkout, source: HealthSource): LogHealthFields
export function formatSleep(min: number): string   // 432 → "7h 12m"
```

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest` and add `"test": "vitest run"` to `package.json` scripts.

- [ ] **Step 2: Write `src/health/types.ts`** (exact shapes above; `EMPTY_HEALTH_FIELDS` has every field `null`).

- [ ] **Step 3: Write the failing tests `src/health/logic.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  activityToWorkoutType, formatSleep, readiness, roundDurationToOptions,
  stepTier, unlinkedWorkouts, workoutLocalDate, workoutToHealthFields,
} from './logic'
import type { HealthRecovery, HealthWorkout } from './types'

const rec = (p: Partial<HealthRecovery>): HealthRecovery => ({
  date: '2026-09-17', sleepMin: 450, stages: null, restingHr: 58, restingHrAvg: 58, hrvMs: 50, hrvAvg: 50, ...p,
})
const localIso = (y: number, m: number, d: number, h = 7) => new Date(y, m - 1, d, h, 0).toISOString()
const wk = (id: string, start: string): HealthWorkout => ({
  id, start, end: start, durationMin: 50, activity: 'Weights', calories: 400, avgHr: 125, maxHr: 160,
  zoneMinutes: { fatBurn: 20, cardio: 10, peak: 2 },
})

describe('readiness', () => {
  it('unknown when null or all metrics null', () => {
    expect(readiness(null)).toBe('unknown')
    expect(readiness(rec({ sleepMin: null, restingHr: null, hrvMs: null }))).toBe('unknown')
  })
  it('good at the boundaries', () => {
    expect(readiness(rec({ sleepMin: 360, hrvMs: 42.5, restingHr: 63 }))).toBe('good')
  })
  it('low on short sleep', () => expect(readiness(rec({ sleepMin: 359 }))).toBe('low'))
  it('low on HRV below 85% of average', () => expect(readiness(rec({ hrvMs: 42 }))).toBe('low'))
  it('low on resting HR more than 5 above average', () => expect(readiness(rec({ restingHr: 64 }))).toBe('low'))
  it('ignores a metric whose average is missing', () => expect(readiness(rec({ hrvMs: 10, hrvAvg: null }))).toBe('good'))
})

describe('activityToWorkoutType', () => {
  it.each([
    ['Weights', 'Strength'], ['Strength training', 'Strength'], ['Outdoor Run', 'Cardio'], ['Walk', 'Cardio'],
    ['Treadmill', 'Cardio'], ['HIIT', 'HIIT'], ['Circuit training', 'HIIT'], ['Yoga', 'Flexibility'],
    ['Swim', 'Swim'], ['Spinning', 'Cycle'], ['Bike', 'Cycle'], ['Tennis', 'Other'],
  ])('%s → %s', (a, t) => expect(activityToWorkoutType(a)).toBe(t))
})

describe('stepTier', () => {
  it.each([[0, ''], [4999, ''], [5000, 'l1'], [7999, 'l1'], [8000, 'l2'], [11999, 'l2'], [12000, 'l3']])(
    '%i → %s', (s, t) => expect(stepTier(s)).toBe(t),
  )
})

describe('workoutLocalDate', () => {
  it('uses the local date of start', () => expect(workoutLocalDate({ start: localIso(2026, 9, 16, 23) })).toBe('2026-09-16'))
})

describe('unlinkedWorkouts', () => {
  const today = '2026-09-17'
  const a = wk('a', localIso(2026, 9, 17, 7))
  const b = wk('b', localIso(2026, 9, 16, 18))
  const c = wk('c', localIso(2026, 9, 15, 7))
  const d = wk('d', localIso(2026, 9, 17, 17))
  it('keeps today/yesterday, excludes linked and dismissed, newest first', () => {
    const out = unlinkedWorkouts([a, b, c, d], [{ health_workout_id: 'a' }, { health_workout_id: null }], [], today)
    expect(out.map((w) => w.id)).toEqual(['d', 'b'])
    expect(unlinkedWorkouts([a, b, d], [], ['d'], today).map((w) => w.id)).toEqual(['a', 'b'])
  })
})

describe('roundDurationToOptions', () => {
  it.each([[52, 0, 50], [58, 1, 0], [95, 1, 35], [0, 0, 0], [900, 12, 55]])(
    '%i min → %ih %im', (m, h, mm) => expect(roundDurationToOptions(m)).toEqual({ hours: h, minutes: mm }),
  )
})

describe('workoutToHealthFields', () => {
  it('maps workout stats to log columns', () => {
    expect(workoutToHealthFields(wk('x', localIso(2026, 9, 17)), 'demo')).toEqual({
      health_source: 'demo', health_workout_id: 'x', calories_kcal: 400, avg_hr: 125, max_hr: 160,
      hr_zone_minutes: { fatBurn: 20, cardio: 10, peak: 2 },
    })
  })
})

describe('formatSleep', () => {
  it('formats minutes', () => {
    expect(formatSleep(432)).toBe('7h 12m')
    expect(formatSleep(45)).toBe('45m')
  })
})
```

- [ ] **Step 4: Run tests — expect FAIL** (`npm test` → "Failed to resolve import './logic'").

- [ ] **Step 5: Implement `src/health/logic.ts`**

```ts
import { addDays, toLocalDateString } from '../lib/dates'
import type { WorkoutType } from '../types/database'
import type { HealthRecovery, HealthSource, HealthWorkout, LogHealthFields } from './types'

export type Readiness = 'low' | 'good' | 'unknown'

export function readiness(r: HealthRecovery | null): Readiness {
  if (!r || (r.sleepMin == null && r.restingHr == null && r.hrvMs == null)) return 'unknown'
  if (r.sleepMin != null && r.sleepMin < 360) return 'low'
  if (r.hrvMs != null && r.hrvAvg != null && r.hrvMs < 0.85 * r.hrvAvg) return 'low'
  if (r.restingHr != null && r.restingHrAvg != null && r.restingHr > r.restingHrAvg + 5) return 'low'
  return 'good'
}

const TYPE_RULES: [RegExp, WorkoutType][] = [
  [/weight|strength|lift/i, 'Strength'],
  [/hiit|interval|circuit/i, 'HIIT'],
  [/yoga|pilates|stretch/i, 'Flexibility'],
  [/swim/i, 'Swim'],
  [/bike|cycl|spin/i, 'Cycle'],
  [/run|walk|hike|elliptical|treadmill/i, 'Cardio'],
]

export function activityToWorkoutType(activity: string): WorkoutType {
  return TYPE_RULES.find(([re]) => re.test(activity))?.[1] ?? 'Other'
}

export function stepTier(steps: number): '' | 'l1' | 'l2' | 'l3' {
  if (steps >= 12000) return 'l3'
  if (steps >= 8000) return 'l2'
  if (steps >= 5000) return 'l1'
  return ''
}

export function workoutLocalDate(w: Pick<HealthWorkout, 'start'>): string {
  return toLocalDateString(new Date(w.start))
}

export function unlinkedWorkouts(
  workouts: HealthWorkout[],
  logs: { health_workout_id?: string | null }[],
  dismissedIds: string[],
  today: string,
): HealthWorkout[] {
  const linked = new Set(logs.map((l) => l.health_workout_id).filter(Boolean))
  const dismissed = new Set(dismissedIds)
  const yesterday = addDays(today, -1)
  return workouts
    .filter((w) => !linked.has(w.id) && !dismissed.has(w.id))
    .filter((w) => {
      const d = workoutLocalDate(w)
      return d === today || d === yesterday
    })
    .sort((a, b) => b.start.localeCompare(a.start))
}

export function roundDurationToOptions(min: number): { hours: number; minutes: number } {
  const total = Math.min(12 * 60 + 55, Math.max(0, Math.round(min / 5) * 5))
  return { hours: Math.floor(total / 60), minutes: total % 60 }
}

export function workoutToHealthFields(w: HealthWorkout, source: HealthSource): LogHealthFields {
  return {
    health_source: source,
    health_workout_id: w.id,
    calories_kcal: w.calories,
    avg_hr: w.avgHr,
    max_hr: w.maxHr,
    hr_zone_minutes: w.zoneMinutes,
  }
}

export function formatSleep(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h}h ${m}m` : `${m}m`
}
```

Note: HIIT is matched before Cardio so "Interval run" maps to HIIT; "Circuit training" must not hit `strength` — it doesn't.

- [ ] **Step 6: Run tests — expect PASS**; run `npm run build && npm run lint`.

- [ ] **Step 7: Commit** `feat(health): types, pure logic and Vitest setup`

---

### Task 2: Mock provider

**Files:**
- Create: `src/health/provider.ts`, `src/health/storage.ts`, `src/health/mockProvider.ts`, `src/health/mockProvider.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `addDays`, `toLocalDateString` from `src/lib/dates`; `isRestLog` from `src/types/database`.
- Produces:
```ts
// provider.ts
export interface HealthProvider {
  source: HealthSource
  getConnection(): Promise<HealthConnection>
  connect(): Promise<void>
  disconnect(): Promise<void>
  getWorkouts(fromDate: string, toDate: string): Promise<HealthWorkout[]>
  getRecovery(date: string): Promise<HealthRecovery | null>
  getDailySteps(fromDate: string, toDate: string): Promise<DailySteps[]>
  markSynced(): Promise<void>
}
// storage.ts
export function readJson<T>(key: string, fallback: T, storage?: Storage | null): T
export function writeJson(key: string, value: unknown, storage?: Storage | null): void
export function safeLocalStorage(): Storage | null
// mockProvider.ts
export type MockProviderDeps = {
  getLogs: () => { log_date: string; workout: string }[]
  storage?: Storage | null
  search?: string          // window.location.search
  now?: () => Date
  connectDelayMs?: number  // default 900
}
export function createMockProvider(deps: MockProviderDeps): HealthProvider
```

- [ ] **Step 1: Write failing tests `src/health/mockProvider.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { createMockProvider } from './mockProvider'

function memStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k),
  }
}
const now = () => new Date(2026, 8, 17, 15, 0)
const logs = [
  { log_date: '2026-09-15', workout: 'Chest · Triceps' },
  { log_date: '2026-09-16', workout: 'Rest' },
]
const make = (search = '', storage = memStorage()) =>
  createMockProvider({ getLogs: () => logs, storage, search, now, connectDelayMs: 0 })

describe('mockProvider', () => {
  it('connect / disconnect round-trips through storage', async () => {
    const storage = memStorage()
    const p = make('', storage)
    expect((await p.getConnection()).status).toBe('disconnected')
    await p.connect()
    expect((await make('', storage).getConnection())).toMatchObject({ status: 'connected', source: 'demo' })
    await p.disconnect()
    expect((await p.getConnection()).status).toBe('disconnected')
  })

  it('?health=expired forces expired', async () => {
    expect((await make('?health=expired').getConnection()).status).toBe('expired')
  })

  it('workouts only on non-rest log dates plus today, deterministic', async () => {
    const w1 = await make().getWorkouts('2026-09-01', '2026-09-17')
    const w2 = await make().getWorkouts('2026-09-01', '2026-09-17')
    expect(w1).toEqual(w2)
    expect(w1.map((w) => w.id)).toEqual(['demo-2026-09-15', 'demo-2026-09-17'])
    for (const w of w1) {
      expect(w.durationMin).toBeGreaterThanOrEqual(30)
      expect(w.durationMin).toBeLessThanOrEqual(90)
      expect(w.maxHr!).toBeGreaterThan(w.avgHr!)
    }
  })

  it('recovery and steps are deterministic and in range', async () => {
    const r = await make().getRecovery('2026-09-17')
    expect(r).toEqual(await make().getRecovery('2026-09-17'))
    expect(r!.sleepMin!).toBeGreaterThanOrEqual(300)
    expect(r!.stages!.deep + r!.stages!.light + r!.stages!.rem + r!.stages!.awake).toBe(r!.sleepMin)
    const steps = await make().getDailySteps('2026-09-11', '2026-09-17')
    expect(steps).toHaveLength(7)
    expect(steps[0].date).toBe('2026-09-11')
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (module not found).

- [ ] **Step 3: Implement `provider.ts`** (interface above) and **`storage.ts`**:

```ts
export function safeLocalStorage(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}
export function readJson<T>(key: string, fallback: T, storage: Storage | null = safeLocalStorage()): T {
  try { const raw = storage?.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback }
}
export function writeJson(key: string, value: unknown, storage: Storage | null = safeLocalStorage()): void {
  try { if (value === null) storage?.removeItem(key); else storage?.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}
```

- [ ] **Step 4: Implement `mockProvider.ts`**

```ts
import { addDays, parseLocalDate, toLocalDateString } from '../lib/dates'
import { isRestLog } from '../types/database'
import type { HealthProvider } from './provider'
import { readJson, safeLocalStorage, writeJson } from './storage'
import type { DailySteps, HealthConnection, HealthRecovery, HealthWorkout } from './types'

const CONN_KEY = 'grind_health_demo_connection'
type Stored = { lastSyncedAt: string | null }

/** Deterministic 0..1 generator seeded by a string (FNV-1a → mulberry32). */
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
    zoneMinutes: { fatBurn: Math.max(0, durationMin - cardio - peak - between(r, 0, 8)), cardio, peak },
  }
}

function nightFor(date: string) {
  const r = rng(`night:${date}`)
  const sleepMin = between(r, 300, 510)
  const deep = Math.round(sleepMin * (0.12 + r() * 0.08))
  const rem = Math.round(sleepMin * (0.18 + r() * 0.07))
  const awake = Math.round(sleepMin * (0.04 + r() * 0.05))
  return { sleepMin, stages: { deep, rem, awake, light: sleepMin - deep - rem - awake }, restingHr: between(r, 52, 66), hrvMs: between(r, 30, 70) }
}

export type MockProviderDeps = {
  getLogs: () => { log_date: string; workout: string }[]
  storage?: Storage | null
  search?: string
  now?: () => Date
  connectDelayMs?: number
}

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
      const trained = new Set(deps.getLogs().filter((l) => !isRestLog(l.workout)).map((l) => l.log_date))
      trained.add(today())
      return [...trained].filter((d) => d >= from && d <= to).sort().map(workoutFor)
    },
    async getRecovery(date) {
      const n = nightFor(date)
      const prev = datesInRange(addDays(date, -7), addDays(date, -1)).map(nightFor)
      const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
      return {
        date, ...n,
        restingHrAvg: avg(prev.map((p) => p.restingHr)),
        hrvAvg: avg(prev.map((p) => p.hrvMs)),
      } satisfies HealthRecovery
    },
    async getDailySteps(from, to) {
      const t = today()
      const hourFrac = Math.min(1, (now().getHours() + now().getMinutes() / 60) / 21)
      return datesInRange(from, to).map((date): DailySteps => {
        const steps = between(rng(`steps:${date}`), 2000, 16000)
        return { date, steps: date === t ? Math.round(steps * hourFrac) : steps }
      })
    },
  }
}
```

Confirm `parseLocalDate` exists in `src/lib/dates.ts` (it does, line 13).

- [ ] **Step 5: Run tests — expect PASS**; `npm run build && npm run lint`.

- [ ] **Step 6: Commit** `feat(health): provider interface and seeded mock provider`

---

### Task 3: `useHealth` hook

**Files:**
- Create: `src/health/useHealth.ts`

**Interfaces:**
- Consumes: `createMockProvider`, `HealthProvider`, `readJson`/`writeJson`, types.
- Produces:
```ts
export type HealthState = {
  enabled: boolean
  source: HealthSource
  connection: HealthConnection | null      // null while first check runs / when disabled
  isConnected: boolean                     // enabled && connection?.status === 'connected'
  workouts: HealthWorkout[]                // last 120 days
  recovery: HealthRecovery | null          // for today
  steps: DailySteps[]                      // last 120 days
  loading: boolean
  connecting: boolean
  error: string | null
  dismissedIds: string[]
  connect(): Promise<void>
  disconnect(): Promise<void>
  sync(): Promise<void>
  dismiss(workoutId: string): void
}
export function useHealth(enabled: boolean, logs: Log[], logsLoading: boolean): HealthState
```

Not unit-tested (thin React glue over tested units); verified in the browser in Task 8.

- [ ] **Step 1: Implement**

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, toLocalDateString } from '../lib/dates'
import type { Log } from '../types/database'
import { createMockProvider } from './mockProvider'
import { readJson, writeJson } from './storage'
import type { DailySteps, HealthConnection, HealthRecovery, HealthSource, HealthWorkout } from './types'

const DISMISSED_KEY = 'grind_health_dismissed'
const RANGE_DAYS = 120

export type HealthState = { /* exactly as in Interfaces */ }

export function useHealth(enabled: boolean, logs: Log[], logsLoading: boolean): HealthState {
  const logsRef = useRef(logs)
  logsRef.current = logs
  // Single place that chooses the provider (Phase 2 swaps this line).
  const provider = useMemo(() => createMockProvider({ getLogs: () => logsRef.current }), [])

  const [connection, setConnection] = useState<HealthConnection | null>(null)
  const [workouts, setWorkouts] = useState<HealthWorkout[]>([])
  const [recovery, setRecovery] = useState<HealthRecovery | null>(null)
  const [steps, setSteps] = useState<DailySteps[]>([])
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => readJson<string[]>(DISMISSED_KEY, []))

  const load = useCallback(async () => {
    const today = toLocalDateString()
    const from = addDays(today, -RANGE_DAYS)
    setLoading(true)
    setError(null)
    try {
      const [w, r, s] = await Promise.all([
        provider.getWorkouts(from, today),
        provider.getRecovery(today),
        provider.getDailySteps(from, today),
      ])
      await provider.markSynced()
      setWorkouts(w)
      setRecovery(r)
      setSteps(s)
      setConnection(await provider.getConnection())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach Fitbit")
    } finally {
      setLoading(false)
    }
  }, [provider])

  // Initial check once logs are ready (mock workouts are derived from log dates).
  useEffect(() => {
    if (!enabled || logsLoading) return
    let cancelled = false
    void provider.getConnection().then((c) => {
      if (cancelled) return
      setConnection(c)
      if (c.status === 'connected') void load()
    })
    return () => { cancelled = true }
  }, [enabled, logsLoading, provider, load])

  const connect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      await provider.connect()
      setConnection(await provider.getConnection())
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect')
    } finally {
      setConnecting(false)
    }
  }, [provider, load])

  const disconnect = useCallback(async () => {
    await provider.disconnect()
    setConnection(await provider.getConnection())
    setWorkouts([]); setRecovery(null); setSteps([])
  }, [provider])

  const dismiss = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 50)
      writeJson(DISMISSED_KEY, next)
      return next
    })
  }, [])

  const isConnected = enabled && connection?.status === 'connected'
  return {
    enabled, source: provider.source, connection, isConnected, workouts, recovery, steps,
    loading, connecting, error, dismissedIds, connect, disconnect, sync: load, dismiss,
  }
}
```

(Write the `HealthState` type out in full in the file — copy from Interfaces.)

- [ ] **Step 2:** `npm run build && npm run lint` — PASS.

- [ ] **Step 3: Commit** `feat(health): useHealth hook`

---

### Task 4: Migration 013 + log types + `useLogs`

**Files:**
- Create: `supabase/migrations/013_log_health_fields.sql`
- Modify: `src/types/database.ts` (`Log`, `LogInsert`), `src/hooks/useLogs.ts`, `README.md` (migration table rows 9–13)

**Interfaces:**
- Consumes: `LogHealthFields`, `ZoneMinutes` from Task 1.
- Produces: `Log` and `LogInsert` include all `LogHealthFields` keys (`LogInsert`: optional). `createLog` / `updateLog` persist them; a Postgres `23505` on the health index throws `Error('That workout is already logged')`.

- [ ] **Step 1: Write migration** — exact SQL from spec §4.1 plus a header comment and the demo-cleanup SQL as a comment.

- [ ] **Step 2: Types** — in `database.ts`: `import type { LogHealthFields } from '../health/types'`; `export type Log = { …existing… } & LogHealthFields`; `export type LogInsert = { …existing… } & Partial<LogHealthFields>`.

- [ ] **Step 3: `useLogs`**
  - `OPTIONAL_COLUMNS` = existing + `'health_source', 'health_workout_id', 'calories_kcal', 'avg_hr', 'max_hr', 'hr_zone_minutes'`.
  - `normalizeLog`: spread `EMPTY_HEALTH_FIELDS` before `...row` so missing columns become `null`; keep existing overrides; add `...pickHealth(overrides)` where overrides carry health fields.
  - `createLog` row: add `health_source: input.health_source ?? null` … for all six.
  - `updateLog` patch: for each of the six, `input.k !== undefined ? input.k : existing.k ?? null`.
  - After the retry loops in both, before `throw err`: `if (err.code === '23505' && /health_workout/i.test(err.message)) throw new Error('That workout is already logged')`.
  - Normalize created/updated with the values that were sent (so UI shows stats even if columns were stripped? No — if stripped, don't show: pass overrides only for columns still present in `row`/`patch`).

- [ ] **Step 4: README** — extend the migrations table with 009–013 (009 invites, 010 invite RLS fix, 011 invites created_by default, 012 admin profile select, 013 log health fields) and change "run all eight" to "run all".

- [ ] **Step 5:** `npm test && npm run build && npm run lint` — PASS.

- [ ] **Step 6: Commit** `feat(health): migration 013 and health fields on logs`

---

### Task 5: Connect row in profile menu

**Files:**
- Create: `src/components/HealthConnectRow.tsx`
- Modify: `src/components/Shell.tsx` (new optional prop `healthControls?: ReactNode`, rendered after `ThemeSegment`), `src/App.tsx` (call `useHealth`, pass row), `src/styles/global.css` (append Fitbit section)

**Interfaces:**
- Consumes: `HealthState`.
- Produces: `export function HealthConnectRow({ health }: { health: HealthState })`; `export function relativeSync(iso: string | null, now?: Date): string` in `src/health/logic.ts` ("just now" <1 min, "N min ago" <60, "N h ago" <24, else "N d ago"; null → "never") — add tests to `logic.test.ts` first (`relativeSync(new Date(Date.now()-120000).toISOString())` → `'2 min ago'`, `null` → `'never'`).

- [ ] **Step 1: TDD `relativeSync`** (failing test → implement → pass).

- [ ] **Step 2: Component**

```tsx
import { relativeSync } from '../health/logic'
import type { HealthState } from '../health/useHealth'

export function HealthConnectRow({ health }: { health: HealthState }) {
  const { connection, connecting, loading } = health
  const label = health.source === 'demo' ? 'Demo data' : 'Google Health'
  return (
    <div className="health-row">
      <div className="health-row-head">
        <span className="health-row-title"><span className="health-dot" data-status={connection?.status ?? 'disconnected'} />Fitbit</span>
        {connection?.status === 'connected' && (
          <span className="health-row-meta">{label} · Synced {relativeSync(connection.lastSyncedAt)}</span>
        )}
        {connection?.status === 'expired' && <span className="health-row-meta warn">Connection expired</span>}
      </div>
      {connection?.status === 'connected' ? (
        <div className="health-row-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void health.sync()} disabled={loading}>
            {loading ? 'Syncing…' : 'Sync now'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void health.disconnect()}>Disconnect</button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-sm btn-full" onClick={() => void health.connect()} disabled={connecting || !connection}>
          {connecting ? 'Connecting…' : connection?.status === 'expired' ? 'Reconnect' : 'Connect Fitbit'}
        </button>
      )}
      {health.error && <div className="health-row-error">{health.error}</div>}
    </div>
  )
}
```

- [ ] **Step 3: Wire** — `App.tsx`: `const health = useHealth(isAdmin, logs, logsLoading)`; `<Shell … healthControls={health.enabled ? <HealthConnectRow health={health} /> : undefined}>`. `Shell.tsx`: render `{healthControls}` right after `<ThemeSegment … />`.

- [ ] **Step 4: CSS** (append to `global.css`):

```css
/* ── Fitbit / health ───────────────────────────────────────────────────────── */
.health-row { margin: 12px 0 10px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-2); }
.health-row-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; }
.health-row-title { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.85rem; }
.health-row-meta { font-size: 0.72rem; color: var(--muted); }
.health-row-meta.warn, .health-row-error { color: var(--danger); }
.health-row-error { font-size: 0.72rem; margin-top: 8px; }
.health-row-actions { display: flex; gap: 6px; }
.health-row-actions .btn { flex: 1; }
.health-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted-2); }
.health-dot[data-status='connected'] { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.health-dot[data-status='expired'] { background: var(--danger); }
```

- [ ] **Step 5:** build + lint; browser: admin menu shows row; Connect → Connecting… → connected with "Demo data · Synced just now"; Disconnect works; `?health=expired` shows Reconnect.

- [ ] **Step 6: Commit** `feat(health): Fitbit connect row in profile menu`

---

### Task 6: Workout detected card, recovery card, steps heatmap

**Files:**
- Create: `src/components/WorkoutDetectedCard.tsx`, `src/components/RecoveryCard.tsx`
- Modify: `src/components/Dashboard.tsx`, `src/components/Heatmap.tsx`, `src/App.tsx`, `src/styles/global.css`

**Interfaces:**
- Consumes: `HealthState`, `unlinkedWorkouts`, `readiness`, `formatSleep`, `stepTier`, `activityToWorkoutType` (not here), `readJson`/`writeJson`.
- Produces:
  - `WorkoutDetectedCard({ workout, moreCount, onLog, onDismiss })` — `workout: HealthWorkout; moreCount: number; onLog: (w: HealthWorkout) => void; onDismiss: (id: string) => void`
  - `RecoveryCard({ recovery, restLoggedToday, restBusy, onRestDay, error, onRetry })`
  - `Dashboard` new props: `health: HealthState`, `onLogWorkout: (w: HealthWorkout) => void`
  - `Heatmap` new prop: `steps?: DailySteps[]` (toggle shown only when defined and non-empty)
  - `App`: `const [attachWorkout, setAttachWorkout] = useState<HealthWorkout | null>(null)`; `openFromWorkout(w)` sets it, clears editing, sets `formDate` undefined, opens form (form wiring in Task 7).

- [ ] **Step 1: `WorkoutDetectedCard`**

```tsx
import { formatDuration } from '../lib/duration'
import { roundDurationToOptions } from '../health/logic'
import type { HealthWorkout } from '../health/types'

type Props = { workout: HealthWorkout; moreCount: number; onLog: (w: HealthWorkout) => void; onDismiss: (id: string) => void }

export function WorkoutDetectedCard({ workout, moreCount, onLog, onDismiss }: Props) {
  const d = roundDurationToOptions(workout.durationMin)
  const time = new Date(workout.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const facts = [
    formatDuration(d.hours, d.minutes),
    workout.calories != null ? `${workout.calories} kcal` : null,
    workout.avgHr != null ? `avg ${workout.avgHr} bpm` : null,
  ].filter(Boolean)
  return (
    <section className="health-card detect-card" aria-label="Workout detected by Fitbit">
      <div className="health-card-kicker"><span className="health-dot" data-status="connected" /> Fitbit detected · {time}{moreCount > 0 ? ` · +${moreCount} more` : ''}</div>
      <div className="detect-card-row">
        <div>
          <div className="detect-card-title">{workout.activity}</div>
          <div className="detect-card-facts">{facts.join(' · ')}</div>
        </div>
        <div className="detect-card-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDismiss(workout.id)}>Dismiss</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onLog(workout)}>Log it</button>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: `RecoveryCard`**

```tsx
import { formatSleep, readiness } from '../health/logic'
import type { HealthRecovery } from '../health/types'

type Props = {
  recovery: HealthRecovery | null
  restLoggedToday: boolean
  restBusy: boolean
  onRestDay: () => void
  error: string | null
  onRetry: () => void
}

function Delta({ value, avg, unit, lowerIsBetter }: { value: number | null; avg: number | null; unit: string; lowerIsBetter?: boolean }) {
  if (value == null || avg == null) return null
  const diff = Math.round(value - avg)
  if (diff === 0) return <span className="rec-delta">= 7-day avg</span>
  const good = lowerIsBetter ? diff < 0 : diff > 0
  return <span className={`rec-delta ${good ? 'good' : 'bad'}`}>{diff > 0 ? '↑' : '↓'}{Math.abs(diff)}{unit} vs 7-day</span>
}

export function RecoveryCard({ recovery, restLoggedToday, restBusy, onRestDay, error, onRetry }: Props) {
  if (error) {
    return (
      <section className="health-card rec-card rec-card--error">
        <span>Couldn't reach Fitbit</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>Retry</button>
      </section>
    )
  }
  if (!recovery) return null
  const state = readiness(recovery)
  const s = recovery.stages
  const total = s ? s.deep + s.light + s.rem + s.awake : 0
  return (
    <section className="health-card rec-card" aria-label="Recovery">
      <div className="health-card-kicker">Recovery · last night</div>
      <div className="rec-grid">
        <div className="rec-tile">
          <div className="label">Sleep</div>
          <div className="rec-num">{recovery.sleepMin != null ? formatSleep(recovery.sleepMin) : '—'}</div>
          {s && total > 0 && (
            <div className="sleep-bar" role="img" aria-label={`Deep ${s.deep}m, light ${s.light}m, REM ${s.rem}m, awake ${s.awake}m`}>
              {(['deep', 'rem', 'light', 'awake'] as const).map((k) => (
                <span key={k} className={`sleep-seg ${k}`} style={{ width: `${(s[k] / total) * 100}%` }} />
              ))}
            </div>
          )}
        </div>
        <div className="rec-tile">
          <div className="label">Resting HR</div>
          <div className="rec-num">{recovery.restingHr ?? '—'}<small>{recovery.restingHr != null ? ' bpm' : ''}</small></div>
          <Delta value={recovery.restingHr} avg={recovery.restingHrAvg} unit="" lowerIsBetter />
        </div>
        <div className="rec-tile">
          <div className="label">HRV</div>
          <div className="rec-num">{recovery.hrvMs ?? '—'}<small>{recovery.hrvMs != null ? ' ms' : ''}</small></div>
          <Delta value={recovery.hrvMs} avg={recovery.hrvAvg} unit="" />
        </div>
      </div>
      {state !== 'unknown' && (
        <div className={`rec-hint ${state}`}>
          <span>{state === 'low' ? 'Recovery looks low — a rest day might pay off.' : 'Recovered — good day to train.'}</span>
          {state === 'low' && (
            <button type="button" className="btn btn-ghost btn-sm btn-rest" onClick={onRestDay} disabled={restBusy || restLoggedToday}>
              {restLoggedToday ? 'Rest logged' : restBusy ? 'Logging…' : 'Rest day'}
            </button>
          )}
        </div>
      )}
      <p className="rec-foot">Estimates from your tracker, not medical advice.</p>
    </section>
  )
}
```

- [ ] **Step 3: Dashboard** — add props; compute:
```ts
const today = toLocalDateString()
const candidates = health.isConnected ? unlinkedWorkouts(health.workouts, logs, health.dismissedIds, today) : []
const restLoggedToday = logs.some((l) => l.log_date === today && isRestLog(l.workout))
```
Render after `.hero-panel`: `{candidates[0] && <WorkoutDetectedCard workout={candidates[0]} moreCount={candidates.length - 1} onLog={onLogWorkout} onDismiss={health.dismiss} />}` then `{health.isConnected && <RecoveryCard recovery={health.recovery} restLoggedToday={restLoggedToday} restBusy={restBusy} onRestDay={() => void handleRest()} error={health.error} onRetry={() => void health.sync()} />}`. Pass `steps={health.isConnected ? health.steps : undefined}` to `Heatmap`.

- [ ] **Step 4: Heatmap steps mode**
  - `const [mode, setMode] = useState<'sessions' | 'steps'>(() => readJson(HEATMAP_MODE_KEY, 'sessions'))`; `const showSteps = mode === 'steps' && !!steps?.length`.
  - `stepsByDate = useMemo(() => new Map(steps?.map((s) => [s.date, s.steps])), [steps])`.
  - Cells: level = showSteps ? `stepTier(stepsByDate.get(date) ?? 0)` : existing; title = showSteps ? `${date} · ${n.toLocaleString()} steps` : existing.
  - Header: keep the toggle button (label changes to `Steps · 16 weeks` in steps mode); when `steps?.length`, render a `theme-seg heatmap-seg` with Sessions / Steps buttons next to it (outside the toggle `<button>` — wrap both in `div.section-head`). Clicking writes `writeJson(HEATMAP_MODE_KEY, m)`.
  - Legend labels: `Less`/`More` → `Fewer steps`/`More steps` in steps mode; steps cells use `.heatmap-cell.steps.l1…l3` colored with `--ice` so the two modes are visually distinct.

- [ ] **Step 5: CSS** (append):

```css
.health-card { background: var(--surface); border: 1px solid var(--border); border-top-color: var(--highlight); border-radius: var(--radius-lg); padding: 14px 16px; margin-bottom: 14px; box-shadow: var(--shadow-card); animation: fade-up var(--dur-page) var(--ease-out) both; }
.health-card-kicker { display: flex; align-items: center; gap: 8px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
.detect-card { border-color: var(--accent-dim); background: linear-gradient(135deg, var(--surface) 0%, var(--hero-mid) 100%); }
.detect-card-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.detect-card-title { font-weight: 800; font-size: 1.05rem; }
.detect-card-facts { color: var(--muted); font-size: 0.82rem; margin-top: 2px; }
.detect-card-actions { display: flex; gap: 6px; }
.rec-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.rec-tile { background: var(--surface-2); border-radius: var(--radius); padding: 10px 12px; min-width: 0; }
.rec-num { font-size: 1.25rem; font-weight: 800; margin-top: 4px; white-space: nowrap; }
.rec-num small { font-size: 0.7rem; color: var(--muted); font-weight: 600; }
.rec-delta { display: block; font-size: 0.68rem; color: var(--muted); margin-top: 2px; }
.rec-delta.good { color: var(--ice); }
.rec-delta.bad { color: var(--danger); }
.sleep-bar { display: flex; height: 6px; border-radius: 999px; overflow: hidden; margin-top: 8px; background: var(--surface-3); }
.sleep-seg.deep { background: var(--ice); }
.sleep-seg.rem { background: var(--accent); }
.sleep-seg.light { background: var(--ice-dim); }
.sleep-seg.awake { background: var(--danger-dim); }
.rec-hint { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; font-size: 0.85rem; font-weight: 600; }
.rec-hint.good { color: var(--text); }
.rec-hint.low { color: var(--danger); }
.rec-foot { margin: 8px 0 0; font-size: 0.66rem; color: var(--muted-2); }
.rec-card--error { display: flex; align-items: center; justify-content: space-between; color: var(--muted); font-size: 0.85rem; }
.section-head { display: flex; align-items: center; gap: 10px; }
.section-head .section-toggle { flex: 1; }
.heatmap-seg { margin-bottom: 10px; }
.heatmap-cell.steps.l1 { background: rgba(110, 231, 245, 0.25); }
.heatmap-cell.steps.l2 { background: rgba(110, 231, 245, 0.55); }
.heatmap-cell.steps.l3 { background: var(--ice); }
@media (max-width: 520px) { .rec-grid { grid-template-columns: 1fr 1fr; } .rec-grid .rec-tile:first-child { grid-column: 1 / -1; } }
```

(Verify `.theme-seg` default width works inline; if it stretches, add `.heatmap-seg { width: auto; }`.)

- [ ] **Step 6:** build + lint; browser: connected → detected card (today's workout), recovery tiles, Sessions/Steps toggle; Dismiss hides card and survives reload; disconnected → none of it renders.

- [ ] **Step 7: Commit** `feat(health): workout detected card, recovery card, steps heatmap`

---

### Task 7: Attach workouts in the log form; show saved stats

**Files:**
- Create: `src/components/HealthStats.tsx`
- Modify: `src/components/LogFormSheet.tsx`, `src/components/LogDetail.tsx`, `src/components/LogCard.tsx`, `src/App.tsx`, `src/styles/global.css`

**Interfaces:**
- Consumes: `LogHealthFields`, `EMPTY_HEALTH_FIELDS`, `workoutToHealthFields`, `workoutLocalDate`, `roundDurationToOptions`, `activityToWorkoutType`, `HealthWorkout`, `HealthSource`.
- Produces:
  - `HealthStats({ fields, compact? })` — `fields: LogHealthFields`; renders nothing when `health_workout_id` is null.
  - `LogFormSheet` new props: `healthWorkouts?: HealthWorkout[]`, `healthSource?: HealthSource`, `attachWorkout?: HealthWorkout | null`.
  - `export function pickHealthFields(log: Partial<LogHealthFields>): LogHealthFields` in `src/health/logic.ts` (TDD: returns `EMPTY_HEALTH_FIELDS` values for missing keys).

- [ ] **Step 1: TDD `pickHealthFields`.**

- [ ] **Step 2: `HealthStats`**

```tsx
import type { LogHealthFields } from '../health/types'

export function HealthStats({ fields, compact }: { fields: LogHealthFields; compact?: boolean }) {
  if (!fields.health_workout_id) return null
  const z = fields.hr_zone_minutes
  const zTotal = z ? z.fatBurn + z.cardio + z.peak : 0
  const facts = [
    fields.calories_kcal != null ? `${fields.calories_kcal} kcal` : null,
    fields.avg_hr != null ? `avg ${fields.avg_hr} bpm` : null,
    fields.max_hr != null ? `max ${fields.max_hr}` : null,
  ].filter(Boolean)
  return (
    <div className={`health-stats${compact ? ' compact' : ''}`}>
      <div className="health-stats-facts">{facts.join(' · ') || 'Linked to Fitbit'}</div>
      {!compact && z && zTotal > 0 && (
        <>
          <div className="zone-bar" role="img" aria-label={`Fat burn ${z.fatBurn} min, cardio ${z.cardio} min, peak ${z.peak} min`}>
            <span className="zone-seg fat" style={{ width: `${(z.fatBurn / zTotal) * 100}%` }} />
            <span className="zone-seg cardio" style={{ width: `${(z.cardio / zTotal) * 100}%` }} />
            <span className="zone-seg peak" style={{ width: `${(z.peak / zTotal) * 100}%` }} />
          </div>
          <div className="zone-legend"><span>Fat burn {z.fatBurn}m</span><span>Cardio {z.cardio}m</span><span>Peak {z.peak}m</span></div>
        </>
      )}
      {fields.health_source === 'demo' && <div className="health-stats-demo">Demo data</div>}
    </div>
  )
}
```

- [ ] **Step 3: `LogFormSheet`**
  - State: `const [health, setHealth] = useState<LogHealthFields>(EMPTY_HEALTH_FIELDS)`.
  - Open effect: editing → `setHealth(pickHealthFields(initial))`; new → `EMPTY_HEALTH_FIELDS`; then if `!initial && attachWorkout` → `applyWorkout(attachWorkout)`. Add `attachWorkout` to deps.
  - `applyWorkout(w)`: `setLogDate(workoutLocalDate(w))`; `const d = roundDurationToOptions(w.durationMin); setDurHours(d.hours); setDurMinutes(d.minutes)`; `setWorkoutType((t) => t || activityToWorkoutType(w.activity))`; `setHealth(workoutToHealthFields(w, healthSource ?? 'demo'))`; `setIsRest(false)`.
  - `dayWorkouts = useMemo(() => (healthWorkouts ?? []).filter((w) => workoutLocalDate(w) === logDate), [healthWorkouts, logDate])`.
  - `linkedElsewhere(id) = logs.some((l) => l.health_workout_id === id && l.id !== initial?.id)`.
  - When step, after Duration field, if `!isRest`:
    - attached → `<div className="field"><label>From Fitbit</label><div className="health-attached"><HealthStats fields={health} compact /><button type="button" className="btn btn-icon" aria-label="Detach Fitbit workout" onClick={() => setHealth(EMPTY_HEALTH_FIELDS)}>✕</button></div></div>`
    - else if `dayWorkouts.length` → `<div className="field"><label>Fitbit workouts on this day</label><div className="fitbit-pick">{dayWorkouts.map((w) => <button key={w.id} type="button" className="fitbit-pick-row" disabled={linkedElsewhere(w.id)} onClick={() => applyWorkout(w)}><strong>{w.activity}</strong><span>{time} · {w.durationMin} min{w.calories != null ? ` · ${w.calories} kcal` : ''}</span>{linkedElsewhere(w.id) && <em>Logged</em>}</button>)}</div></div>`
  - Review step: after the When row, when `health.health_workout_id && !isRest`: `<button type="button" className="review-row" onClick={() => goToStep(0)}><span className="review-label">Fitbit</span><span className="review-value"><HealthStats fields={health} compact /></span><span className="review-edit">Edit</span></button>`.
  - `submit`: spread `...(isRest ? EMPTY_HEALTH_FIELDS : health)` into the `onSave` payload.

- [ ] **Step 4: `LogDetail`** — after the Focus block: `{current.health_workout_id && <div className="detail-block"><div className="label">Fitbit</div><HealthStats fields={pickHealthFields(current)} /></div>}`.

- [ ] **Step 5: `LogCard`** — `const hr = log.avg_hr != null || log.calories_kcal != null ? [log.avg_hr != null ? `♥ ${log.avg_hr}` : null, log.calories_kcal != null ? `${log.calories_kcal} kcal` : null].filter(Boolean).join(' · ') : null`; push `{ key: 'hr', label: hr, kind: 'health' }` into `tags` when present.

- [ ] **Step 6: `App.tsx`**
  - `openFromWorkout(w)`: `setEditing(null); setFormDate(undefined); setAttachWorkout(w); setFormOpen(true)`.
  - `openNew` / `openEdit` → `setAttachWorkout(null)`. Form `onClose` → also `setAttachWorkout(null)`.
  - `<LogFormSheet … healthWorkouts={health.isConnected ? health.workouts : []} healthSource={health.source} attachWorkout={attachWorkout} />`.
  - `<Dashboard … health={health} onLogWorkout={openFromWorkout} />`.

- [ ] **Step 7: CSS** (append):

```css
.health-stats { display: flex; flex-direction: column; gap: 6px; }
.health-stats-facts { font-weight: 700; font-size: 0.88rem; }
.health-stats.compact .health-stats-facts { font-size: 0.82rem; }
.health-stats-demo { font-size: 0.64rem; color: var(--muted-2); text-transform: uppercase; letter-spacing: 0.08em; }
.zone-bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: var(--surface-3); }
.zone-seg.fat { background: var(--ice); }
.zone-seg.cardio { background: var(--accent); }
.zone-seg.peak { background: var(--danger); }
.zone-legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 0.7rem; color: var(--muted); }
.health-attached { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid var(--accent-dim); border-radius: var(--radius); background: var(--surface-2); }
.fitbit-pick { display: flex; flex-direction: column; gap: 6px; }
.fitbit-pick-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; text-align: left; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); font-size: 0.82rem; }
.fitbit-pick-row span { color: var(--muted); flex: 1; }
.fitbit-pick-row em { font-style: normal; font-size: 0.7rem; color: var(--muted-2); }
.fitbit-pick-row:hover:not(:disabled) { border-color: var(--accent); }
.fitbit-pick-row:disabled { opacity: 0.55; cursor: not-allowed; }
.tag.health { background: var(--ice-dim); color: var(--ice); }
```

- [ ] **Step 8:** `npm test && npm run build && npm run lint` — PASS.

- [ ] **Step 9: Commit** `feat(health): attach Fitbit workouts to logs and show saved stats`

---

### Task 8: End-to-end browser verification and push

- [ ] **Step 1:** Local dev server, admin account. Check in light and dark, desktop and 375px:
  1. Disconnected: no cards, no Steps toggle; profile shows Connect Fitbit.
  2. Connect → cards appear; heatmap toggle works and persists.
  3. Detected card → Log it → form has date, duration, type, "From Fitbit" chip → Save → card disappears; LogDetail shows Fitbit block; LogCard shows ♥ tag. (Stats persist only after migration 013 is run; without it the session still saves.)
  4. New log by hand on a trained date → picker lists the workout; the one already logged shows "Logged" and is disabled.
  5. Edit a linked log → chip shows saved stats; ✕ detaches → save → stats gone.
  6. `?health=expired` → cards hidden, Reconnect shown.
  7. Console has no new errors.
- [ ] **Step 2:** Fix anything found (each fix: test if logic, build, lint, commit).
- [ ] **Step 3:** `git push origin main`; wait for Vercel status success; open production `/app` and confirm the login screen and marketing page still load.
