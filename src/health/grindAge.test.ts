import { describe, expect, it } from 'vitest'
import {
  FACTOR_GROUPS,
  ageGap,
  currentWeekStart,
  factorTip,
  formatFactorValue,
  formatGap,
  gapSentence,
  gapSublabel,
  gapTone,
  groupYears,
  missingHint,
  paceSublabel,
  paceWeeksToGo,
  paceTone,
  trendPoints,
  type GrindAgeFactor,
  type GrindAgeFactorId,
  type GrindAgeOk,
  type GrindAgeResult,
} from './grindAge'

describe('currentWeekStart', () => {
  it('returns the same day for a Monday', () => {
    expect(currentWeekStart('2026-10-05')).toBe('2026-10-05')
  })

  it('goes back to the previous Monday from a Sunday', () => {
    expect(currentWeekStart('2026-10-04')).toBe('2026-09-28')
  })

  it('handles a mid-week day', () => {
    expect(currentWeekStart('2026-10-01')).toBe('2026-09-28')
  })

  it('crosses a month boundary', () => {
    expect(currentWeekStart('2026-03-01')).toBe('2026-02-23')
  })

  it('crosses a year boundary', () => {
    expect(currentWeekStart('2027-01-01')).toBe('2026-12-28')
  })
})

const ALL_IDS: GrindAgeFactorId[] = [
  'sleep_hours',
  'sleep_consistency',
  'steps',
  'lower_zones',
  'higher_zones',
  'strength',
  'resting_hr',
  'vo2max',
  'lean_mass',
]

const factor = (id: GrindAgeFactorId, years: number | null): GrindAgeFactor => ({
  id,
  label: id,
  value: years == null ? null : 1,
  unit: 'u',
  target: 't',
  years,
})

const resultWith = (years: Partial<Record<GrindAgeFactorId, number | null>>, grindAge = 31.6): GrindAgeResult => ({
  chronologicalAge: 30,
  grindAge,
  factors: ALL_IDS.map((id) => factor(id, years[id] ?? null)),
  missing: [],
})

describe('FACTOR_GROUPS', () => {
  it('places every factor in exactly one group, in order', () => {
    const flat = FACTOR_GROUPS.flatMap((g) => g.factors)
    expect([...flat].sort()).toEqual([...ALL_IDS].sort())
    expect(new Set(flat).size).toBe(flat.length)
    expect(FACTOR_GROUPS.map((g) => g.id)).toEqual(['sleep', 'cardio', 'strength'])
  })

  it('has a tip and a missing-data hint for every factor', () => {
    for (const id of ALL_IDS) {
      expect(factorTip(id).length).toBeGreaterThan(10)
      expect(missingHint(id).length).toBeGreaterThan(10)
    }
    expect(missingHint('lean_mass')).toBe('Log weight and body fat below')
  })
})

describe('groupYears', () => {
  it('sums the group factors that have data', () => {
    const r = resultWith({ sleep_hours: 1.2, sleep_consistency: 0.6, steps: -0.4 })
    expect(groupYears(r, 'sleep')).toBeCloseTo(1.8)
    expect(groupYears(r, 'cardio')).toBeCloseTo(-0.4)
  })

  it('skips null factors but keeps the rest', () => {
    const r = resultWith({ strength: -0.6, lean_mass: null })
    expect(groupYears(r, 'strength')).toBeCloseTo(-0.6)
  })

  it('is null when every factor in the group is missing', () => {
    expect(groupYears(resultWith({ steps: 1 }), 'sleep')).toBeNull()
  })

  it('keeps a real zero distinct from missing', () => {
    expect(groupYears(resultWith({ sleep_hours: 0 }), 'sleep')).toBe(0)
  })

  it('does not leak float noise', () => {
    expect(groupYears(resultWith({ sleep_hours: 0.1, sleep_consistency: 0.2 }), 'sleep')).toBe(0.3)
  })
})

describe('gapTone', () => {
  it('is lime from half a year younger', () => {
    expect(gapTone(-0.5)).toBe('accent')
    expect(gapTone(-3)).toBe('accent')
  })

  it('is level inside ±0.5', () => {
    expect(gapTone(-0.4)).toBe('activity')
    expect(gapTone(0)).toBe('activity')
    expect(gapTone(0.4)).toBe('activity')
  })

  it('is red from half a year older', () => {
    expect(gapTone(0.5)).toBe('danger')
    expect(gapTone(2.1)).toBe('danger')
  })

  it('rounds to one decimal first', () => {
    expect(gapTone(0.46)).toBe('danger')
    expect(gapTone(-0.44)).toBe('activity')
  })
})

describe('gap and pace wording', () => {
  it('computes the gap to one decimal', () => {
    expect(ageGap(resultWith({}, 31.64))).toBe(1.6)
  })

  it('formats the signed gap', () => {
    expect(formatGap(1.6)).toBe('+1.6')
    expect(formatGap(-2.14)).toBe('−2.1')
    expect(formatGap(0.02)).toBe('0.0')
  })

  it('words the gap', () => {
    expect(gapSublabel(1.6)).toBe('1.6 yrs older')
    expect(gapSublabel(-2.1)).toBe('2.1 yrs younger')
    expect(gapSublabel(0)).toBe('On par')
    expect(gapSentence(1.6)).toBe('Your habits add 1.6 years to your real age.')
    expect(gapSentence(-2.1)).toBe('Your habits take 2.1 years off your real age.')
    expect(gapSentence(1)).toBe('Your habits add 1.0 year to your real age.')
  })

  it('picks the pace tone around 1.0x', () => {
    expect(paceTone(0.8)).toBe('accent')
    expect(paceTone(0.95)).toBe('activity')
    expect(paceTone(1.05)).toBe('activity')
    expect(paceTone(1.2)).toBe('danger')
    expect(paceSublabel(0.8)).toBe('Ageing slower than the calendar')
    expect(paceSublabel(1)).toBe('Ageing in step with the calendar')
    expect(paceSublabel(1.4)).toBe('Ageing faster than the calendar')
  })
})

describe('trendPoints', () => {
  const ok = (history: GrindAgeOk['history']): GrindAgeOk => ({
    status: 'ok',
    weekStart: '2026-09-28',
    computedAt: '',
    result: resultWith({}, 31.6),
    pace: null,
    history,
  })

  it('appends the current reading when history stops short of this week', () => {
    const pts = trendPoints(ok([{ weekStart: '2026-09-21', grindAge: 32 }]))
    expect(pts.map((p) => p.weekStart)).toEqual(['2026-09-21', '2026-09-28'])
    expect(pts[1].grindAge).toBe(31.6)
  })

  it('does not duplicate a week already in history', () => {
    const pts = trendPoints(ok([{ weekStart: '2026-09-28', grindAge: 31.6 }]))
    expect(pts).toHaveLength(1)
  })

  it('starts from the current reading when history is empty', () => {
    expect(trendPoints(ok([]))).toHaveLength(1)
  })
})

describe('formatFactorValue', () => {
  it('keeps whole numbers separated and rounds decimals to one place', () => {
    expect(formatFactorValue(9840, 'steps')).toBe(`${(9840).toLocaleString()} steps`)
    expect(formatFactorValue(41.24, 'ml/kg/min')).toBe('41.2 ml/kg/min')
  })
})

describe('paceWeeksToGo', () => {
  const week = '2026-09-28'

  it('has no span without history', () => {
    expect(paceWeeksToGo([], week)).toEqual({ spanWeeks: 0, weeksToGo: 12, filled: 1, needsReadings: false })
  })

  it('counts whole weeks from the oldest reading, not the number of readings', () => {
    const r = paceWeeksToGo([{ weekStart: '2026-08-03' }, { weekStart: '2026-09-21' }], week)
    expect(r.spanWeeks).toBe(8)
    expect(r.weeksToGo).toBe(4)
    expect(r.filled).toBe(9)
    expect(r.needsReadings).toBe(false)
  })

  it('never says zero weeks to go and caps the dots at 12', () => {
    const r = paceWeeksToGo([{ weekStart: '2026-06-01' }], week)
    expect(r.spanWeeks).toBe(17)
    expect(r.weeksToGo).toBe(1)
    expect(r.filled).toBe(12)
    expect(r.needsReadings).toBe(true)
  })

  it('flags a span of exactly 12 weeks', () => {
    const r = paceWeeksToGo([{ weekStart: '2026-07-06' }], week)
    expect(r.spanWeeks).toBe(12)
    expect(r.needsReadings).toBe(true)
  })
})
