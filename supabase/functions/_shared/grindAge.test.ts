import { describe, expect, it } from 'vitest'
import { computeGrindAge, estimateVo2max, paceOfAging } from './grindAge'
import type { GrindAgeFactorId, GrindAgeInputs, GrindAgeReading } from './grindAgeTypes'

// Every input at its reference level
const healthy: GrindAgeInputs = {
  chronologicalAge: 35,
  sex: 'male',
  sleepHours: 7.5,
  sleepConsistencyMin: 30,
  dailySteps: 8000,
  lowerZoneMinPerWeek: 150,
  higherZoneMinPerWeek: 75,
  strengthMinPerWeek: 60,
  restingHr: 60,
  weightKg: 72.5,
  bodyFatPct: 15,
  heightM: 1.8, // FFMI = 61.6 / 3.24 ≈ 19.0
}

// Same habits, with a typical female FFMI (45 / 2.82 ≈ 15.9)
const healthyFemale: Partial<GrindAgeInputs> = { sex: 'female', weightKg: 60, bodyFatPct: 25, heightM: 1.68 }

const poor: GrindAgeInputs = {
  ...healthy,
  sleepHours: 5.5,
  sleepConsistencyMin: 90,
  dailySteps: 3000,
  lowerZoneMinPerWeek: 0,
  higherZoneMinPerWeek: 0,
  strengthMinPerWeek: 0,
  restingHr: 80,
  weightKg: 60,
  bodyFatPct: 30, // FFMI = 42 / 3.24 ≈ 13.0
}

const run = (over: Partial<GrindAgeInputs>) => computeGrindAge({ ...healthy, ...over })
const years = (over: Partial<GrindAgeInputs>, id: GrindAgeFactorId) =>
  run(over).factors.find((f) => f.id === id)!.years!

const ORDER: GrindAgeFactorId[] = [
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

describe('estimateVo2max', () => {
  it('follows Uth: 15.3 × (208 − 0.7 × age) / resting HR', () => {
    expect(estimateVo2max(40, 60)).toBe(45.9)
    expect(estimateVo2max(30, 50)).toBe(round1((15.3 * 187) / 50))
  })
})

describe('computeGrindAge', () => {
  it('lists all nine factors in a fixed order', () => {
    const r = computeGrindAge(healthy)
    expect(r.factors.map((f) => f.id)).toEqual(ORDER)
    expect(r.missing).toEqual([])
    expect(r.factors.find((f) => f.id === 'vo2max')!.estimated).toBe(true)
  })

  it('puts a healthy profile close to real age', () => {
    // Only VO₂ max moves: Uth's estimate at 60 bpm beats the FRIEND median a little
    for (const chronologicalAge of [25, 35, 40]) {
      for (const sex of [{}, healthyFemale]) {
        const r = run({ chronologicalAge, ...sex })
        expect(Math.abs(r.grindAge - chronologicalAge)).toBeLessThanOrEqual(1.5)
      }
    }
  })

  it('makes a poor profile clearly older', () => {
    const r = computeGrindAge(poor)
    expect(r.grindAge - r.chronologicalAge).toBeGreaterThan(10)
  })

  it('adds years as each input gets worse', () => {
    const cases: [GrindAgeFactorId, Partial<GrindAgeInputs>, Partial<GrindAgeInputs>][] = [
      ['sleep_hours', { sleepHours: 7.5 }, { sleepHours: 5 }],
      ['sleep_hours', { sleepHours: 8 }, { sleepHours: 9.5 }],
      ['sleep_consistency', { sleepConsistencyMin: 30 }, { sleepConsistencyMin: 75 }],
      ['steps', { dailySteps: 10000 }, { dailySteps: 5000 }],
      ['lower_zones', { lowerZoneMinPerWeek: 300 }, { lowerZoneMinPerWeek: 30 }],
      ['higher_zones', { higherZoneMinPerWeek: 150 }, { higherZoneMinPerWeek: 10 }],
      ['strength', { strengthMinPerWeek: 60 }, { strengthMinPerWeek: 0 }],
      ['resting_hr', { restingHr: 55 }, { restingHr: 75 }],
      ['vo2max', { restingHr: 55 }, { restingHr: 75 }],
      ['lean_mass', { weightKg: 80 }, { weightKg: 60 }],
    ]
    for (const [id, better, worse] of cases) {
      expect(years(worse, id), id).toBeGreaterThan(years(better, id))
    }
  })

  it('scores reference levels as zero years', () => {
    const r = computeGrindAge(healthy)
    for (const id of ['sleep_hours', 'sleep_consistency', 'steps', 'lower_zones', 'higher_zones', 'strength', 'resting_hr'])
      expect(r.factors.find((f) => f.id === id)!.years, id).toBe(0)
  })

  it('caps each factor at ±4 years', () => {
    expect(years({ restingHr: 120 }, 'resting_hr')).toBe(4)
    expect(years({ chronologicalAge: 70, restingHr: 40 }, 'vo2max')).toBe(-4)
    const r = computeGrindAge(poor)
    for (const f of r.factors) expect(Math.abs(f.years!)).toBeLessThanOrEqual(4)
  })

  it('lists missing inputs and leaves them out of the sum', () => {
    const r = run({ restingHr: null, heightM: null, dailySteps: null })
    expect(r.missing).toEqual(['steps', 'resting_hr', 'vo2max', 'lean_mass'])
    expect(r.factors).toHaveLength(9)
    for (const id of r.missing) {
      const f = r.factors.find((x) => x.id === id)!
      expect(f.value).toBeNull()
      expect(f.years).toBeNull()
    }
    const sum = r.factors.reduce((a, f) => a + (f.years ?? 0), 0)
    expect(r.grindAge).toBeCloseTo(r.chronologicalAge + sum, 5)
  })

  it('falls back to real age when nothing is recorded', () => {
    const r = computeGrindAge({
      chronologicalAge: 41.26,
      sex: 'female',
      sleepHours: null,
      sleepConsistencyMin: null,
      dailySteps: null,
      lowerZoneMinPerWeek: null,
      higherZoneMinPerWeek: null,
      strengthMinPerWeek: null,
      restingHr: null,
      weightKg: null,
      bodyFatPct: null,
      heightM: null,
    })
    expect(r.missing).toEqual(ORDER)
    expect(r.chronologicalAge).toBe(41.3)
    expect(r.grindAge).toBe(41.3)
  })

  it('computes FFMI from weight, body fat and height', () => {
    const f = computeGrindAge(healthy).factors.find((x) => x.id === 'lean_mass')!
    expect(f.value).toBe(19)
  })
})

describe('paceOfAging', () => {
  const weeks = (offsets: number[]): GrindAgeReading[] =>
    offsets.map((o, i) => {
      const weekStart = new Date(Date.UTC(2026, 0, 5 + 7 * i)).toISOString().slice(0, 10)
      const chronologicalAge = 40 + (7 * i) / 365.25
      return { weekStart, chronologicalAge, grindAge: chronologicalAge + o }
    })

  it('needs at least four readings', () => {
    expect(paceOfAging([])).toBeNull()
    expect(paceOfAging(weeks([1, 1, 1]))).toBeNull()
  })

  it('needs the readings to span at least 12 weeks', () => {
    expect(paceOfAging(weeks([2, 2, 2, 2, 2, 2, 2, 2]))).toBeNull() // 7 weeks apart
    expect(paceOfAging(weeks(Array(13).fill(2)))).toBe(1) // exactly 12 weeks apart
  })

  it('is 1 when the gap to real age holds steady', () => {
    expect(paceOfAging(weeks(Array(14).fill(2)))).toBe(1)
  })

  it('clamps to −1 and 3', () => {
    const up = Array.from({ length: 14 }, (_, i) => i)
    expect(paceOfAging(weeks(up))).toBe(3)
    expect(paceOfAging(weeks([...up].reverse()))).toBe(-1)
  })

  it('only counts the last 26 weeks', () => {
    // Wild early swings, then 27 steady weekly readings (26 weeks apart)
    expect(paceOfAging(weeks([-9, 9, -9, 9, ...Array(27).fill(1)]))).toBe(1)
  })
})

function round1(x: number) {
  return Math.round(x * 10) / 10
}

describe('strength volume', () => {
  it('never makes a heavy lifter older for training more', () => {
    const at = (min: number) =>
      computeGrindAge({ ...healthy, strengthMinPerWeek: min }).factors.find((f) => f.id === 'strength')!.years!
    // ~3–4 long sessions a week: must score no worse than the 60 min/wk target
    expect(at(350)).toBeLessThanOrEqual(at(60))
    expect(at(140)).toBeLessThanOrEqual(at(60))
  })
})
