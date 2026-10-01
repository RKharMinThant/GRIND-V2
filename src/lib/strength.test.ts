import { describe, expect, it } from 'vitest'
import type { LiftHistoryPoint } from './overload'
import {
  bestOneRepMax,
  convertSets,
  formatPrToast,
  estimatedOneRepMax,
  newPrKinds,
  personalBests,
  prEvents,
  recentPrs,
  toUnit,
} from './strength'

let n = 0
function point(
  sets: [number, number][],
  recorded_at: string,
  unit: 'kg' | 'lb' = 'kg',
): LiftHistoryPoint {
  const sets_detail = sets.map(([reps, weight]) => ({ reps, weight }))
  return {
    id: `p${n++}`,
    lift_id: 'l1',
    sets_detail,
    unit,
    volume: sets_detail.reduce((s, x) => s + x.reps * x.weight, 0),
    recorded_at,
  }
}

describe('estimatedOneRepMax', () => {
  it('uses Epley and rounds to 0.5', () => {
    // 100 * (1 + 5/30) = 116.666… -> 116.5
    expect(estimatedOneRepMax({ reps: 5, weight: 100 })).toBe(116.5)
    // 60 * (1 + 10/30) = 80
    expect(estimatedOneRepMax({ reps: 10, weight: 60 })).toBe(80)
    // 82.5 * (1 + 8/30) = 104.5
    expect(estimatedOneRepMax({ reps: 8, weight: 82.5 })).toBe(104.5)
  })

  it('returns the weight for a single rep', () => {
    expect(estimatedOneRepMax({ reps: 1, weight: 140 })).toBe(140)
  })

  it('caps reps at 12', () => {
    // 50 * (1 + 12/30) = 70
    expect(estimatedOneRepMax({ reps: 12, weight: 50 })).toBe(70)
    expect(estimatedOneRepMax({ reps: 30, weight: 50 })).toBe(70)
  })

  it('is 0 for zero reps or zero weight', () => {
    expect(estimatedOneRepMax({ reps: 0, weight: 100 })).toBe(0)
    expect(estimatedOneRepMax({ reps: 5, weight: 0 })).toBe(0)
    expect(estimatedOneRepMax({ reps: -1, weight: 100 })).toBe(0)
  })
})

describe('bestOneRepMax', () => {
  it('picks the strongest set', () => {
    expect(
      bestOneRepMax([
        { reps: 10, weight: 60 },
        { reps: 5, weight: 100 },
      ]),
    ).toBe(116.5)
    expect(bestOneRepMax([])).toBe(0)
  })
})

describe('toUnit', () => {
  it('converts between kg and lb', () => {
    expect(toUnit(100, 'kg', 'kg')).toBe(100)
    expect(toUnit(100, 'lb', 'kg')).toBeCloseTo(45.359237, 6)
    expect(toUnit(45.359237, 'kg', 'lb')).toBeCloseTo(100, 6)
  })
})

describe('personalBests', () => {
  it('is all null for no history', () => {
    expect(personalBests([], 'kg')).toEqual({ oneRepMax: null, heaviest: null, volume: null })
  })

  it('finds each best with its date', () => {
    const history = [
      point([[5, 100]], '2026-01-01T00:00:00Z'), // 1RM 116.5, vol 500
      point([[10, 60], [10, 60]], '2026-01-08T00:00:00Z'), // 1RM 80, vol 1200
      point([[3, 110]], '2026-01-15T00:00:00Z'), // 1RM 121, heaviest 110
    ]
    const pb = personalBests(history, 'kg')
    expect(pb.oneRepMax).toEqual({ value: 121, recorded_at: '2026-01-15T00:00:00Z' })
    expect(pb.heaviest).toEqual({ value: 110, reps: 3, recorded_at: '2026-01-15T00:00:00Z' })
    expect(pb.volume).toEqual({ value: 1200, recorded_at: '2026-01-08T00:00:00Z' })
  })

  it('compares across unit changes in the current unit', () => {
    const history = [
      point([[1, 200]], '2026-01-01T00:00:00Z', 'lb'), // 90.7 kg
      point([[1, 95]], '2026-01-08T00:00:00Z', 'kg'),
    ]
    const pb = personalBests(history, 'kg')
    expect(pb.heaviest?.value).toBe(95)
    const inLb = personalBests(history, 'lb')
    expect(inLb.heaviest?.value).toBeCloseTo(209.4, 1)
    expect(inLb.heaviest?.recorded_at).toBe('2026-01-08T00:00:00Z')
  })
})

describe('convertSets', () => {
  it('keeps the 1RM trend and Est. 1RM best in agreement across unit changes', () => {
    const history = [
      point([[5, 225]], '2026-01-01T00:00:00Z', 'lb'),
      point([[5, 100]], '2026-01-08T00:00:00Z', 'kg'),
      point([[5, 230]], '2026-01-15T00:00:00Z', 'lb'),
    ]
    for (const u of ['kg', 'lb'] as const) {
      const trend = history.map((p) => bestOneRepMax(convertSets(p.sets_detail, p.unit === 'lb' ? 'lb' : 'kg', u)))
      expect(Math.max(...trend)).toBe(personalBests(history, u).oneRepMax?.value)
    }
  })
})

describe('prEvents', () => {
  it('does not count the first entry as a PR', () => {
    expect(prEvents('Bench', [point([[5, 100]], '2026-01-01T00:00:00Z')], 'kg')).toEqual([])
    expect(prEvents('Bench', [], 'kg')).toEqual([])
  })

  it('emits an event for each category strictly beaten', () => {
    const history = [
      point([[5, 100]], '2026-01-01T00:00:00Z'),
      point([[5, 105]], '2026-01-08T00:00:00Z'),
    ]
    const events = prEvents('Bench', history, 'kg')
    expect(events.map((e) => e.kind).sort()).toEqual(['heaviest', 'oneRepMax', 'volume'])
    const orm = events.find((e) => e.kind === 'oneRepMax')
    expect(orm).toEqual({
      liftName: 'Bench',
      kind: 'oneRepMax',
      value: 122.5, // 105 * (1 + 5/30) = 122.5
      unit: 'kg',
      recorded_at: '2026-01-08T00:00:00Z',
    })
  })

  it('does not count ties', () => {
    const history = [
      point([[5, 100]], '2026-01-01T00:00:00Z'),
      point([[5, 100]], '2026-01-08T00:00:00Z'),
    ]
    expect(prEvents('Bench', history, 'kg')).toEqual([])
  })

  it('must beat every earlier entry, not just the previous one', () => {
    const history = [
      point([[5, 100]], '2026-01-01T00:00:00Z'),
      point([[5, 90]], '2026-01-08T00:00:00Z'),
      point([[5, 95]], '2026-01-15T00:00:00Z'),
    ]
    expect(prEvents('Bench', history, 'kg')).toEqual([])
  })
})

describe('recentPrs', () => {
  it('returns newest first and respects the limit', () => {
    const events = prEvents(
      'Bench',
      [
        point([[5, 100]], '2026-01-01T00:00:00Z'),
        point([[5, 105]], '2026-01-08T00:00:00Z'),
        point([[5, 110]], '2026-01-15T00:00:00Z'),
      ],
      'kg',
    )
    const recent = recentPrs(events, 4)
    expect(recent).toHaveLength(4)
    expect(recent[0].recorded_at).toBe('2026-01-15T00:00:00Z')
    expect(recent[3].recorded_at).toBe('2026-01-08T00:00:00Z')
    expect(recentPrs(events)).toHaveLength(6)
  })
})

describe('newPrKinds', () => {
  const previous = [
    point([[5, 100]], '2026-01-01T00:00:00Z'),
    point([[5, 100], [5, 100]], '2026-01-08T00:00:00Z'),
  ]

  it('is empty without previous history', () => {
    expect(newPrKinds([], [{ reps: 5, weight: 200 }], 'kg')).toEqual([])
  })

  it('is empty when nothing is beaten (ties included)', () => {
    expect(newPrKinds(previous, [{ reps: 5, weight: 100 }, { reps: 5, weight: 100 }], 'kg')).toEqual([])
  })

  it('reports the kinds beaten', () => {
    // heavier single set: new 1RM and heaviest, but volume 525 < 1000
    expect(newPrKinds(previous, [{ reps: 5, weight: 105 }], 'kg')).toEqual(['oneRepMax', 'heaviest'])
    // more total volume at the same top set
    expect(
      newPrKinds(previous, [{ reps: 5, weight: 100 }, { reps: 5, weight: 100 }, { reps: 5, weight: 100 }], 'kg'),
    ).toEqual(['volume'])
  })

  it('compares in the new unit', () => {
    // previous best 100 kg; 225 lb ≈ 102.06 kg beats it
    expect(newPrKinds(previous, [{ reps: 5, weight: 225 }], 'lb')).toContain('heaviest')
    // 200 lb ≈ 90.7 kg does not
    expect(newPrKinds(previous, [{ reps: 5, weight: 200 }], 'lb')).toEqual([])
  })
})

describe('formatPrToast', () => {
  const sets = [{ reps: 5, weight: 100 }]
  it('prefers 1RM, then heaviest, then volume', () => {
    expect(formatPrToast('Bench press', ['volume', 'oneRepMax'], sets, 'kg')).toBe(
      'New PR · Bench press · 1RM est. 116.5 kg · +1 more',
    )
    expect(formatPrToast('Bench press', ['heaviest'], sets, 'kg')).toBe(
      'New PR · Bench press · Heaviest 100 kg',
    )
    expect(formatPrToast('Bench press', ['volume'], sets, 'lb')).toBe(
      'New PR · Bench press · Volume 500 lb',
    )
  })
  it('is null with no PRs', () => {
    expect(formatPrToast('Bench press', [], sets, 'kg')).toBeNull()
  })
})
