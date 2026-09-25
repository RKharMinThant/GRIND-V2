import { beforeEach, describe, expect, it } from 'vitest'
import {
  FRESH_MS,
  clearHealthCache,
  isFresh,
  readSection,
  readSnapshot,
  writeSection,
  writeSnapshot,
} from './cache'
import type { HealthConnection, TodaySummary } from './types'

/** Minimal in-memory Storage so tests never touch a real browser. */
function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  }
}

const connection: HealthConnection = { status: 'connected', lastSyncedAt: '2026-09-25T08:00:00Z', source: 'google_health' }
const today: TodaySummary = { date: '2026-09-25', steps: 8120, distanceKm: 6.1, zoneMinutes: 22, calories: 2400 }
const bundle = {
  connection,
  workouts: [],
  recovery: { date: '2026-09-25', sleepMin: 450, stages: null, restingHr: 58, restingHrAvg: 59, hrvMs: 41, hrvAvg: 40 },
  steps: [{ date: '2026-09-25', steps: 8120 }],
  today,
}

let storage: Storage
beforeEach(() => {
  storage = memoryStorage()
})

describe('snapshot', () => {
  it('round-trips the last sync for the same account and day', () => {
    writeSnapshot('user-a', 'google_health', '2026-09-25', bundle, 1000, storage)
    const snap = readSnapshot('user-a', 'google_health', '2026-09-25', storage)
    expect(snap?.savedAt).toBe(1000)
    expect(snap?.today?.steps).toBe(8120)
    expect(snap?.connection.status).toBe('connected')
  })

  it("drops today's numbers once the day has changed, but keeps history", () => {
    writeSnapshot('user-a', 'google_health', '2026-09-25', bundle, 1000, storage)
    const snap = readSnapshot('user-a', 'google_health', '2026-09-26', storage)
    // Yesterday's steps must never be shown as today's
    expect(snap?.today).toBeNull()
    expect(snap?.recovery).toBeNull()
    expect(snap?.steps).toHaveLength(1)
  })

  it('never shows one account the data of another on a shared phone', () => {
    writeSnapshot('user-a', 'google_health', '2026-09-25', bundle, 1000, storage)
    expect(readSnapshot('user-b', 'google_health', '2026-09-25', storage)).toBeNull()
  })

  it('keeps demo data and real data apart', () => {
    writeSnapshot('user-a', 'demo', '2026-09-25', bundle, 1000, storage)
    expect(readSnapshot('user-a', 'google_health', '2026-09-25', storage)).toBeNull()
  })

  it('treats corrupt storage as empty rather than crashing the app', () => {
    storage.setItem('grind_health:v1:user-a:google_health:bundle', '{not json')
    expect(readSnapshot('user-a', 'google_health', '2026-09-25', storage)).toBeNull()
  })

  it('does nothing without an account', () => {
    writeSnapshot(undefined, 'google_health', '2026-09-25', bundle, 1000, storage)
    expect(storage.length).toBe(0)
    expect(readSnapshot(undefined, 'google_health', '2026-09-25', storage)).toBeNull()
  })
})

describe('sections', () => {
  it('round-trips a Body section for the same day', () => {
    writeSection('user-a', 'google_health', 'sleep', '2026-09-25', { nights: [] }, 2000, storage)
    expect(readSection('user-a', 'google_health', 'sleep', '2026-09-25', storage)).toEqual({
      data: { nights: [] },
      savedAt: 2000,
    })
  })

  it("ignores a section saved on another day — it describes a different 'today'", () => {
    writeSection('user-a', 'google_health', 'sleep', '2026-09-25', { nights: [] }, 2000, storage)
    expect(readSection('user-a', 'google_health', 'sleep', '2026-09-26', storage)).toBeNull()
  })

  it('keeps sections separate from each other', () => {
    writeSection('user-a', 'google_health', 'sleep', '2026-09-25', { nights: [] }, 2000, storage)
    expect(readSection('user-a', 'google_health', 'heart', '2026-09-25', storage)).toBeNull()
  })
})

describe('isFresh', () => {
  it('is fresh for ten minutes after a sync', () => {
    expect(FRESH_MS).toBe(10 * 60 * 1000)
    expect(isFresh(1_000, 1_000 + FRESH_MS - 1)).toBe(true)
    expect(isFresh(1_000, 1_000 + FRESH_MS + 1)).toBe(false)
  })

  it('is never fresh without a sync', () => {
    expect(isFresh(0, 5_000)).toBe(false)
  })

  it('is not fresh when the clock went backwards', () => {
    // A saved time in the future means the phone clock moved; refresh rather than trust it
    expect(isFresh(10_000, 5_000)).toBe(false)
  })
})

describe('clearHealthCache', () => {
  it("removes one account's saved health data and nothing else", () => {
    writeSnapshot('user-a', 'google_health', '2026-09-25', bundle, 1000, storage)
    writeSection('user-a', 'google_health', 'sleep', '2026-09-25', { nights: [] }, 2000, storage)
    writeSnapshot('user-b', 'google_health', '2026-09-25', bundle, 1000, storage)
    storage.setItem('grind_theme', 'dark')

    clearHealthCache('user-a', storage)

    expect(readSnapshot('user-a', 'google_health', '2026-09-25', storage)).toBeNull()
    expect(readSection('user-a', 'google_health', 'sleep', '2026-09-25', storage)).toBeNull()
    expect(readSnapshot('user-b', 'google_health', '2026-09-25', storage)).not.toBeNull()
    expect(storage.getItem('grind_theme')).toBe('dark')
  })

  it('removes every account on sign-out', () => {
    writeSnapshot('user-a', 'google_health', '2026-09-25', bundle, 1000, storage)
    writeSnapshot('user-b', 'google_health', '2026-09-25', bundle, 1000, storage)
    storage.setItem('grind_theme', 'dark')

    clearHealthCache(undefined, storage)

    expect(readSnapshot('user-a', 'google_health', '2026-09-25', storage)).toBeNull()
    expect(readSnapshot('user-b', 'google_health', '2026-09-25', storage)).toBeNull()
    expect(storage.getItem('grind_theme')).toBe('dark')
  })
})
