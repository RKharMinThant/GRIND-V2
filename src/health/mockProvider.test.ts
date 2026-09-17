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

  it('Today and Body sections are deterministic and plausible', async () => {
    const p = make()
    const today = await p.getToday('2026-09-17')
    expect(today).toEqual(await make().getToday('2026-09-17'))
    const steps = await p.getDailySteps('2026-09-17', '2026-09-17')
    expect(today?.steps).toBe(steps[0].steps)

    const activity = await p.getBodySection('activity', '2026-09-17')
    expect(activity).toHaveLength(30)
    expect(activity.at(-1)?.date).toBe('2026-09-17')
    expect(activity).toEqual(await make().getBodySection('activity', '2026-09-17'))

    const heart = await p.getBodySection('heart', '2026-09-17')
    expect(heart.restingHr).toHaveLength(30)
    expect(heart.daily).toHaveLength(14)
    // now = 15:00 → curve stops before 900 minutes
    expect(heart.curveToday.at(-1)!.minute).toBeLessThan(900)
    expect(heart.curveToday.every((c) => c.bpm > 30 && c.bpm < 220)).toBe(true)

    const sleep = await p.getBodySection('sleep', '2026-09-17')
    expect(sleep.nights).toHaveLength(14)
    const night = sleep.nights.at(-1)!
    const total = (Date.parse(night.end) - Date.parse(night.start)) / 60_000
    expect(night.segments[0].startMin).toBe(0)
    expect(night.segments.at(-1)!.endMin).toBe(total)
    for (let i = 1; i < night.segments.length; i++) {
      expect(night.segments[i].startMin).toBe(night.segments[i - 1].endMin)
    }

    const vitals = await p.getBodySection('vitals', '2026-09-17')
    expect(vitals.spo2).toHaveLength(30)
    expect(vitals.spo2.every((v) => v.avg >= 95 && v.avg <= 100)).toBe(true)
    expect(vitals.weight.length).toBeGreaterThan(0)
  })
})
