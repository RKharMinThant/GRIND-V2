import { describe, expect, it } from 'vitest'
import type { DailyActivity } from '../health/types'
import { addDays } from './dates'
import type { LiftHistoryPoint } from './overload'
import {
  formatVsAverage,
  liftingVolumeByDay,
  loadSummary,
  zoneMinutesByDay,
} from './trainingLoad'

const TODAY = '2026-06-15'

/** A map with `value` on the given days-back offsets. */
function days(entries: Record<number, number>): Map<string, number> {
  return new Map(Object.entries(entries).map(([back, v]) => [addDays(TODAY, -Number(back)), v]))
}

function point(localDate: string, sets: { reps: number; weight: number }[], unit = 'kg'): LiftHistoryPoint {
  const [y, m, d] = localDate.split('-').map(Number)
  return {
    id: localDate,
    lift_id: 'l1',
    sets_detail: sets,
    unit,
    volume: 0,
    // Local noon, so the local date is stable in any timezone
    recorded_at: new Date(y, m - 1, d, 12).toISOString(),
  }
}

describe('loadSummary windows', () => {
  it('counts days 0–6 as this week and 7–34 as the baseline', () => {
    const s = loadSummary(days({ 0: 10, 6: 20, 7: 400, 34: 400, 35: 999 }), TODAY)
    expect(s.thisWeek).toBe(30)
    expect(s.baseline).toBe(200) // (400 + 400) ÷ 4, day 35 ignored
  })

  it('ignores future days', () => {
    const byDay = new Map([[addDays(TODAY, 1), 500]])
    expect(loadSummary(byDay, TODAY).thisWeek).toBe(0)
  })

  it('divides the 4-week total by 4', () => {
    const s = loadSummary(days({ 7: 100, 14: 100, 21: 100, 28: 100, 3: 100 }), TODAY)
    expect(s.baseline).toBe(100)
    expect(s.ratio).toBe(1)
  })
})

describe('loadSummary baseline length', () => {
  const steady = (back: number) => days(Object.fromEntries(Array.from({ length: back + 1 }, (_, i) => [i, 10])))

  it('is steady for a constant daily value with the default 28-day baseline', () => {
    const s = loadSummary(steady(34), TODAY)
    expect(s.ratio).toBe(1)
    expect(s.status).toBe('steady')
  })

  it('is steady for a constant daily value with a 23-day baseline (days 7–29)', () => {
    const s = loadSummary(steady(29), TODAY, 23)
    expect(s.ratio).toBe(1)
    expect(s.status).toBe('steady')
  })
})

describe('loadSummary status', () => {
  const at = (ratio: number) => loadSummary(days({ 0: ratio * 100, 7: 400 }), TODAY)

  it('is building when the baseline is 0', () => {
    const s = loadSummary(days({ 0: 500 }), TODAY)
    expect(s).toMatchObject({ baseline: 0, ratio: null, status: 'building' })
  })

  it('is ramping above 1.5, steady at exactly 1.5', () => {
    expect(at(1.51).status).toBe('ramping')
    expect(at(1.5).status).toBe('steady')
  })

  it('is lighter below 0.8, steady at exactly 0.8', () => {
    expect(at(0.79).status).toBe('lighter')
    expect(at(0.8).status).toBe('steady')
  })

  it('is steady in the middle', () => {
    expect(at(1).status).toBe('steady')
  })

  it('is lighter with nothing this week', () => {
    expect(loadSummary(days({ 7: 400 }), TODAY).status).toBe('lighter')
  })
})

describe('liftingVolumeByDay', () => {
  it('sums reps × weight per local date', () => {
    const map = liftingVolumeByDay(
      [
        point('2026-06-14', [{ reps: 10, weight: 100 }]),
        point('2026-06-14', [{ reps: 5, weight: 50 }]),
        point('2026-06-13', [{ reps: 1, weight: 10 }]),
      ],
      'kg',
    )
    expect(map.get('2026-06-14')).toBe(1250)
    expect(map.get('2026-06-13')).toBe(10)
  })

  it('converts each row to the preferred unit', () => {
    const lb = liftingVolumeByDay([point('2026-06-14', [{ reps: 10, weight: 100 }], 'lb')], 'kg')
    expect(lb.get('2026-06-14')).toBeCloseTo(10 * 45.4, 5) // 100 lb → 45.4 kg per set
    const kg = liftingVolumeByDay([point('2026-06-14', [{ reps: 10, weight: 100 }], 'kg')], 'lb')
    expect(kg.get('2026-06-14')).toBeCloseTo(10 * 220.5, 5)
  })
})

describe('zoneMinutesByDay', () => {
  it('adds the three zones and skips days without zone data', () => {
    const activity = [
      { date: '2026-06-14', azm: { fatBurn: 10, cardio: 5, peak: 2 } },
      { date: '2026-06-13', azm: null },
    ] as DailyActivity[]
    const map = zoneMinutesByDay(activity)
    expect(map.get('2026-06-14')).toBe(17)
    expect(map.has('2026-06-13')).toBe(false)
  })
})

describe('formatVsAverage', () => {
  it('formats signed percentages', () => {
    expect(formatVsAverage(1.18)).toBe('+18%')
    expect(formatVsAverage(0.88)).toBe('-12%')
    expect(formatVsAverage(1)).toBe('0%')
    expect(formatVsAverage(null)).toBeNull()
  })
})
