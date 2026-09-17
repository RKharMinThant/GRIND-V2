import { describe, expect, it } from 'vitest'
import {
  normalizeActivity,
  normalizeHeart,
  normalizeSleepNights,
  normalizeToday,
  normalizeVitals,
} from './bodyNormalize'

const civil = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}
/** Daily roll-up point as returned live (newest first in arrays below). */
const roll = (iso: string, value: Record<string, unknown>) => ({
  civilStartTime: { date: civil(iso), time: {} },
  civilEndTime: { date: civil(iso), time: {} },
  ...value,
})

describe('normalizeToday', () => {
  it('builds the Home summary from single-day roll-ups', () => {
    expect(
      normalizeToday('2026-09-17', {
        steps: [roll('2026-09-17', { steps: { countSum: '7214' } })],
        distance: [roll('2026-09-17', { distance: { millimetersSum: '5312000' } })],
        azm: [
          roll('2026-09-17', {
            activeZoneMinutes: { sumInFatBurnHeartZone: '12', sumInCardioHeartZone: '8', sumInPeakHeartZone: '4' },
          }),
        ],
        calories: [roll('2026-09-17', { totalCalories: { kcalSum: 2140.6 } })],
      }),
    ).toEqual({ date: '2026-09-17', steps: 7214, distanceKm: 5.3, zoneMinutes: 24, calories: 2141 })
  })

  it('returns nulls when a day has no data', () => {
    expect(normalizeToday('2026-09-17', { steps: [], distance: [], azm: [], calories: [] })).toEqual({
      date: '2026-09-17',
      steps: null,
      distanceKm: null,
      zoneMinutes: null,
      calories: null,
    })
  })
})

describe('normalizeActivity', () => {
  it('joins roll-ups by date, ascending', () => {
    const out = normalizeActivity({
      steps: [roll('2026-09-17', { steps: { countSum: '9000' } }), roll('2026-09-16', { steps: { countSum: '12000' } })],
      distance: [roll('2026-09-16', { distance: { millimetersSum: '8460000' } })],
      azm: [roll('2026-09-17', { activeZoneMinutes: { sumInFatBurnHeartZone: '5' } })],
      activeMinutes: [
        roll('2026-09-17', {
          activeMinutes: {
            activeMinutesRollupByActivityLevel: [
              { activityLevel: 'LIGHT', activeMinutesSum: '142' },
              { activityLevel: 'MODERATE', activeMinutesSum: '20' },
              { activityLevel: 'VIGOROUS', activeMinutesSum: '9' },
            ],
          },
        }),
      ],
      calories: [roll('2026-09-16', { totalCalories: { kcalSum: 2500.2 } })],
      floors: [roll('2026-09-16', { floors: { countSum: '6' } })],
    })
    expect(out).toEqual([
      {
        date: '2026-09-16',
        steps: 12000,
        distanceKm: 8.5,
        azm: null,
        activeMin: null,
        calories: 2500,
        floors: 6,
      },
      {
        date: '2026-09-17',
        steps: 9000,
        distanceKm: null,
        azm: { fatBurn: 5, cardio: 0, peak: 0 },
        activeMin: { light: 142, moderate: 20, vigorous: 9 },
        calories: null,
        floors: null,
      },
    ])
  })
})

describe('normalizeHeart', () => {
  it('maps trends, daily range, zones and the 5-minute curve', () => {
    const out = normalizeHeart({
      rhr: [
        { dailyRestingHeartRate: { date: civil('2026-09-17'), beatsPerMinute: '64' } },
        { dailyRestingHeartRate: { date: civil('2026-09-16'), beatsPerMinute: '62' } },
      ],
      hrv: [
        {
          dailyHeartRateVariability: {
            date: civil('2026-09-17'),
            averageHeartRateVariabilityMilliseconds: 40,
            deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 115.4,
          },
        },
      ],
      daily: [
        roll('2026-09-17', { heartRate: { beatsPerMinuteAvg: 77.96, beatsPerMinuteMax: 159, beatsPerMinuteMin: 49 } }),
      ],
      zones: [
        roll('2026-09-17', {
          timeInHeartRateZone: {
            timeInHeartRateZones: [
              { heartRateZone: 'LIGHT', duration: '57480s' },
              { heartRateZone: 'MODERATE', duration: '1500s' },
              { heartRateZone: 'VIGOROUS', duration: '630s' },
              { heartRateZone: 'PEAK', duration: '0s' },
            ],
          },
        }),
      ],
      curve: [
        { startTime: '2026-09-17T12:20:00Z', endTime: '2026-09-17T12:25:00Z', heartRate: { beatsPerMinuteAvg: 101.01 } },
        { startTime: '2026-09-16T20:05:00Z', endTime: '2026-09-16T20:10:00Z', heartRate: { beatsPerMinuteAvg: 58.4 } },
      ],
      // Local midnight 2026-09-17 at UTC+4
      dayStartIso: '2026-09-16T20:00:00Z',
    })
    expect(out).toEqual({
      restingHr: [
        { date: '2026-09-16', bpm: 62 },
        { date: '2026-09-17', bpm: 64 },
      ],
      hrv: [{ date: '2026-09-17', ms: 115 }],
      daily: [{ date: '2026-09-17', min: 49, avg: 78, max: 159 }],
      zonesToday: { light: 958, moderate: 25, vigorous: 11, peak: 0 },
      curveToday: [
        { minute: 5, bpm: 58 },
        { minute: 980, bpm: 101 },
      ],
    })
  })

  it('handles an empty day', () => {
    expect(normalizeHeart({ rhr: [], hrv: [], daily: [], zones: [], curve: [], dayStartIso: '2026-09-16T20:00:00Z' })).toEqual({
      restingHr: [],
      hrv: [],
      daily: [],
      zonesToday: null,
      curveToday: [],
    })
  })
})

describe('normalizeSleepNights', () => {
  const night = (end: string, main: boolean, asleep: string) => ({
    sleep: {
      interval: { startTime: '2026-09-16T19:00:00Z', endTime: end, endUtcOffset: '14400s' },
      metadata: { mainSleep: main },
      stages: [
        { type: 'AWAKE', startTime: '2026-09-16T19:00:00Z', endTime: '2026-09-16T19:10:00Z' },
        { type: 'LIGHT', startTime: '2026-09-16T19:10:00Z', endTime: '2026-09-16T20:00:00Z' },
        { type: 'DEEP', startTime: '2026-09-16T20:00:00Z', endTime: '2026-09-16T20:45:00Z' },
        { type: 'REM', startTime: '2026-09-16T20:45:00Z', endTime: '2026-09-16T21:30:00Z' },
        { type: 'UNKNOWN', startTime: '2026-09-16T21:30:00Z', endTime: '2026-09-16T21:31:00Z' },
      ],
      summary: {
        minutesAsleep: asleep,
        minutesAwake: '25',
        minutesToFallAsleep: '9',
        stagesSummary: [
          { type: 'AWAKE', minutes: '25' },
          { type: 'LIGHT', minutes: '220' },
          { type: 'DEEP', minutes: '75' },
          { type: 'REM', minutes: '100' },
        ],
      },
    },
  })

  it('keeps the main sleep per night, oldest first, with timeline segments', () => {
    const out = normalizeSleepNights([
      night('2026-09-17T03:00:00Z', true, '395'),
      { sleep: { ...night('2026-09-17T10:00:00Z', false, '60').sleep } },
      night('2026-09-16T03:00:00Z', true, '420'),
    ])
    expect(out.map((n) => [n.date, n.asleepMin])).toEqual([
      ['2026-09-16', 420],
      ['2026-09-17', 395],
    ])
    expect(out[1]).toMatchObject({
      start: '2026-09-16T19:00:00Z',
      end: '2026-09-17T03:00:00Z',
      awakeMin: 25,
      toFallAsleepMin: 9,
      stages: { deep: 75, light: 220, rem: 100, awake: 25 },
    })
    expect(out[1].segments).toEqual([
      { stage: 'awake', startMin: 0, endMin: 10 },
      { stage: 'light', startMin: 10, endMin: 60 },
      { stage: 'deep', startMin: 60, endMin: 105 },
      { stage: 'rem', startMin: 105, endMin: 150 },
    ])
  })

  it('caps at 14 nights', () => {
    const many = Array.from({ length: 20 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 7, 1 + i, 3)).toISOString()
      return night(d, true, '400')
    })
    const out = normalizeSleepNights(many)
    expect(out).toHaveLength(14)
    expect(out.at(-1)?.date).toBe('2026-08-20')
  })
})

describe('normalizeVitals', () => {
  it('maps SpO2, breathing, skin temperature delta and weight, ascending', () => {
    expect(
      normalizeVitals({
        spo2: [
          {
            dailyOxygenSaturation: {
              date: civil('2026-09-17'),
              averagePercentage: 97.8,
              lowerBoundPercentage: 96.2,
              upperBoundPercentage: 98.7,
            },
          },
          { dailyOxygenSaturation: { date: civil('2026-09-16'), averagePercentage: 97.14 } },
        ],
        breathing: [{ dailyRespiratoryRate: { date: civil('2026-09-17'), breathsPerMinute: 16.84 } }],
        temp: [
          {
            dailySleepTemperatureDerivations: {
              date: civil('2026-09-17'),
              nightlyTemperatureCelsius: 33.536,
              baselineTemperatureCelsius: 33.521,
            },
          },
          { dailySleepTemperatureDerivations: { date: civil('2026-09-16'), nightlyTemperatureCelsius: 33.2 } },
        ],
        weight: [
          {
            weight: {
              sampleTime: { civilTime: { date: civil('2026-08-22'), time: { hours: 12 } } },
              weightGrams: 89000,
            },
          },
        ],
      }),
    ).toEqual({
      spo2: [
        { date: '2026-09-16', avg: 97.1, low: null, high: null },
        { date: '2026-09-17', avg: 97.8, low: 96.2, high: 98.7 },
      ],
      breathing: [{ date: '2026-09-17', bpm: 16.8 }],
      skinTemp: [{ date: '2026-09-17', deltaC: 0 }],
      weight: [{ date: '2026-08-22', kg: 89 }],
    })
  })
})
