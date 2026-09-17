import { describe, expect, it } from 'vitest'
import { createMockProvider } from './mockProvider'

function memStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
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
    expect(await make('', storage).getConnection()).toMatchObject({ status: 'connected', source: 'demo' })
    await p.disconnect()
    expect((await p.getConnection()).status).toBe('disconnected')
  })

  it('works when storage is unavailable', async () => {
    const p = createMockProvider({ getLogs: () => logs, storage: null, now, connectDelayMs: 0, search: '' })
    await p.connect()
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
      expect(new Date(w.end).getTime() - new Date(w.start).getTime()).toBe(w.durationMin * 60_000)
    }
  })

  it('recovery and steps are deterministic and in range', async () => {
    const r = await make().getRecovery('2026-09-17')
    expect(r).toEqual(await make().getRecovery('2026-09-17'))
    expect(r!.sleepMin!).toBeGreaterThanOrEqual(300)
    expect(r!.sleepMin!).toBeLessThanOrEqual(510)
    const s = r!.stages!
    expect(s.deep + s.light + s.rem + s.awake).toBe(r!.sleepMin)
    expect(r!.restingHrAvg).not.toBeNull()
    const steps = await make().getDailySteps('2026-09-11', '2026-09-17')
    expect(steps).toHaveLength(7)
    expect(steps[0].date).toBe('2026-09-11')
    expect(steps).toEqual(await make().getDailySteps('2026-09-11', '2026-09-17'))
  })
})
