import { describe, expect, it } from 'vitest'
import {
  buildRecovery,
  civilDateString,
  humanizeEnum,
  normalizeExercise,
  normalizeStepsRollup,
  parseDurationSeconds,
  toInt,
} from './normalize'

const d = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

describe('scalar parsers', () => {
  it('parseDurationSeconds', () => {
    expect(parseDurationSeconds('3600s')).toBe(3600)
    expect(parseDurationSeconds('1.5s')).toBe(1.5)
    expect(parseDurationSeconds(undefined)).toBeNull()
    expect(parseDurationSeconds('bad')).toBeNull()
  })
  it('toInt', () => {
    expect(toInt('142')).toBe(142)
    expect(toInt(58.6)).toBe(59)
    expect(toInt(null)).toBeNull()
    expect(toInt('x')).toBeNull()
  })
  it('civilDateString', () => {
    expect(civilDateString({ year: 2026, month: 9, day: 7 })).toBe('2026-09-07')
    expect(civilDateString(undefined)).toBeNull()
  })
  it('humanizeEnum', () => {
    expect(humanizeEnum('WEIGHTLIFTING')).toBe('Weightlifting')
    expect(humanizeEnum('HIGH_INTENSITY_INTERVAL_TRAINING')).toBe('High intensity interval training')
  })
})

describe('normalizeExercise', () => {
  const base = {
    name: 'users/abc/dataTypes/exercise/dataPoints/ex-1',
    exercise: {
      interval: { startTime: '2026-09-17T00:20:00Z', endTime: '2026-09-17T01:15:00Z' },
      exerciseType: 'WEIGHTLIFTING',
      displayName: '',
      activeDuration: '3000s',
      metricsSummary: {
        caloriesKcal: 412.7,
        averageHeartRateBeatsPerMinute: '128',
        heartRateZoneDurations: {
          lightTime: '600s',
          moderateTime: '1500s',
          vigorousTime: '660s',
          peakTime: '90s',
        },
      },
    },
  }

  it('maps all fields', () => {
    expect(normalizeExercise(base)).toEqual({
      id: 'ex-1',
      start: '2026-09-17T00:20:00Z',
      end: '2026-09-17T01:15:00Z',
      durationMin: 50,
      activity: 'Weightlifting',
      calories: 413,
      avgHr: 128,
      maxHr: null,
      zoneMinutes: { fatBurn: 25, cardio: 11, peak: 2 },
      // Kept so a walk can be told apart from training
      exerciseType: 'WEIGHTLIFTING',
    })
  })

  it('prefers displayName, falls back to interval length, tolerates missing metrics', () => {
    const w = normalizeExercise({
      name: 'users/abc/dataTypes/exercise/dataPoints/ex-2',
      exercise: {
        interval: { startTime: '2026-09-16T10:00:00Z', endTime: '2026-09-16T10:42:00Z' },
        exerciseType: 'RUNNING',
        displayName: 'Morning run',
      },
    })
    expect(w).toMatchObject({ id: 'ex-2', activity: 'Morning run', durationMin: 42, calories: null, avgHr: null, zoneMinutes: null })
  })

  it('returns null without a start time', () => {
    expect(normalizeExercise({ name: 'x', exercise: {} })).toBeNull()
  })
})

describe('buildRecovery', () => {
  const sleep = [
    {
      sleep: {
        interval: { endTime: '2026-09-16T23:00:00Z', civilEndTime: { date: d('2026-09-17') } },
        summary: {
          minutesAsleep: '40',
          stagesSummary: [{ type: 'ASLEEP', minutes: '40' }],
        },
      },
    },
    {
      sleep: {
        interval: { endTime: '2026-09-17T06:30:00Z', civilEndTime: { date: d('2026-09-17') } },
        summary: {
          minutesAsleep: '432',
          stagesSummary: [
            { type: 'DEEP', minutes: '70' },
            { type: 'LIGHT', minutes: '230' },
            { type: 'REM', minutes: '100' },
            { type: 'AWAKE', minutes: '25' },
            { type: 'RESTLESS', minutes: '7' },
          ],
        },
      },
    },
    {
      sleep: {
        interval: { civilEndTime: { date: d('2026-09-16') } },
        summary: { minutesAsleep: '500' },
      },
    },
  ]
  const rhrDays: [string, string][] = [
    ['2026-09-09', '70'], // 8 days before — outside the window
    ['2026-09-10', '58'],
    ['2026-09-11', '60'],
    ['2026-09-13', '56'],
    ['2026-09-16', '58'],
    ['2026-09-17', '63'],
  ]
  const rhr = rhrDays.map(([date, bpm]) => ({ dailyRestingHeartRate: { date: d(date), beatsPerMinute: bpm } }))
  const hrv = [
    { dailyHeartRateVariability: { date: d('2026-09-15'), rootMeanSquareOfSuccessiveDifferencesMilliseconds: 50 } },
    { dailyHeartRateVariability: { date: d('2026-09-16'), averageHeartRateVariabilityMilliseconds: 44 } },
    { dailyHeartRateVariability: { date: d('2026-09-17'), rootMeanSquareOfSuccessiveDifferencesMilliseconds: 39.6 } },
  ]

  it('picks the main sleep ending on the date and averages the previous 7 days', () => {
    expect(buildRecovery('2026-09-17', sleep, rhr, hrv)).toEqual({
      date: '2026-09-17',
      sleepMin: 432,
      stages: { deep: 70, light: 230, rem: 100, awake: 32 },
      restingHr: 63,
      restingHrAvg: 58,
      hrvMs: 40,
      hrvAvg: 47,
    })
  })

  it('handles the live Fitbit shapes: UTC offset end time, mainSleep flag, deep-sleep HRV', () => {
    const live = [
      {
        // Longer nap that is NOT the main sleep
        sleep: {
          interval: { endTime: '2026-09-17T10:00:00Z', endUtcOffset: '14400s' },
          metadata: { mainSleep: false },
          summary: { minutesAsleep: '480' },
        },
      },
      {
        // Ends 2026-09-16T22:30Z = 2026-09-17 02:30 local (UTC+4)
        sleep: {
          interval: { endTime: '2026-09-16T22:30:00Z', endUtcOffset: '14400s' },
          metadata: { mainSleep: true },
          summary: {
            minutesAsleep: '395',
            stagesSummary: [
              { type: 'AWAKE', minutes: '41', count: '12' },
              { type: 'LIGHT', minutes: '220', count: '20' },
              { type: 'DEEP', minutes: '75', count: '4' },
              { type: 'REM', minutes: '100', count: '6' },
            ],
          },
        },
      },
    ]
    const liveHrv = [
      {
        dailyHeartRateVariability: {
          date: d('2026-09-17'),
          averageHeartRateVariabilityMilliseconds: 31.2,
          deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 44.6,
        },
      },
      {
        dailyHeartRateVariability: {
          date: d('2026-09-16'),
          averageHeartRateVariabilityMilliseconds: 30,
        },
      },
    ]
    expect(buildRecovery('2026-09-17', live, [], liveHrv)).toEqual({
      date: '2026-09-17',
      sleepMin: 395,
      stages: { deep: 75, light: 220, rem: 100, awake: 41 },
      restingHr: null,
      restingHrAvg: null,
      hrvMs: 45,
      hrvAvg: 30,
    })
  })

  it('returns null when nothing is available', () => {
    expect(buildRecovery('2026-09-17', [], [], [])).toBeNull()
  })

  it('keeps partial data', () => {
    expect(buildRecovery('2026-09-16', sleep, [], [])).toMatchObject({
      sleepMin: 500,
      stages: null,
      restingHr: null,
      hrvAvg: null,
    })
  })
})

describe('normalizeStepsRollup', () => {
  it('maps, sorts and de-duplicates', () => {
    expect(
      normalizeStepsRollup([
        { civilStartTime: { date: d('2026-09-16') }, steps: { countSum: '8120' } },
        { civilStartTime: { date: d('2026-09-15') }, steps: { countSum: '4001' } },
        { civilStartTime: { date: d('2026-09-16') }, steps: { countSum: '8120' } },
        { civilStartTime: { date: d('2026-09-17') } },
      ]),
    ).toEqual([
      { date: '2026-09-15', steps: 4001 },
      { date: '2026-09-16', steps: 8120 },
      { date: '2026-09-17', steps: 0 },
    ])
  })
})
