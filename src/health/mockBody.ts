import { addDays, parseLocalDate } from '../lib/dates'
import { between, datesInRange, nightFor, rng, stepsFor, workoutFor } from './mockSeed'
import type {
  BodySectionData,
  BodySectionId,
  DailyActivity,
  HeartSection,
  SleepNight,
  SleepSegment,
  TodaySummary,
  VitalsSection,
} from './types'

/** Demo Body data, seeded per date and consistent with the mock steps / recovery / workouts. */

const round1 = (n: number) => Math.round(n * 10) / 10

function activityFor(date: string, today: string, now: Date): DailyActivity {
  const r = rng(`activity:${date}`)
  const steps = stepsFor(date, today, now)
  const fatBurn = between(r, 0, 35)
  return {
    date,
    steps,
    distanceKm: round1(steps * 0.00074),
    azm: { fatBurn, cardio: between(r, 0, 20), peak: between(r, 0, 6) },
    activeMin: { light: between(r, 90, 260), moderate: between(r, 5, 45), vigorous: between(r, 0, 30) },
    calories: Math.round(1750 + steps * 0.045 + fatBurn * 4),
    floors: r() < 0.4 ? between(r, 1, 14) : null,
  }
}

export function mockToday(date: string, today: string, now: Date): TodaySummary {
  const a = activityFor(date, today, now)
  return {
    date,
    steps: a.steps,
    distanceKm: a.distanceKm,
    zoneMinutes: a.azm ? a.azm.fatBurn + a.azm.cardio + a.azm.peak : null,
    calories: a.calories,
  }
}

function heartFor(date: string, today: string, now: Date): HeartSection {
  const from30 = addDays(date, -29)
  const days30 = datesInRange(from30, date)
  const r = rng(`heart:${date}`)

  // Curve: sleeping low overnight, daytime wander, a workout bump
  const workout = workoutFor(date)
  const day = parseLocalDate(date)
  const workoutStartMin = Math.round((Date.parse(workout.start) - day.getTime()) / 60_000)
  const lastMinute = date === today ? now.getHours() * 60 + now.getMinutes() : 1440
  const curveToday: HeartSection['curveToday'] = []
  for (let minute = 0; minute < lastMinute; minute += 5) {
    const c = rng(`hr:${date}:${minute}`)
    let bpm = minute < 390 ? 54 + c() * 6 : 68 + c() * 22
    if (minute >= workoutStartMin && minute < workoutStartMin + workout.durationMin) {
      bpm = (workout.avgHr ?? 120) + (c() - 0.5) * 30
    }
    curveToday.push({ minute, bpm: Math.round(bpm) })
  }

  return {
    restingHr: days30.map((d) => ({ date: d, bpm: nightFor(d).restingHr })),
    hrv: days30.map((d) => ({ date: d, ms: nightFor(d).hrvMs })),
    daily: datesInRange(addDays(date, -13), date).map((d) => {
      const h = rng(`hrday:${d}`)
      const min = nightFor(d).restingHr - between(h, 2, 6)
      return { date: d, min, avg: between(h, 70, 84), max: between(h, 140, 175) }
    }),
    zonesToday: {
      light: between(r, 600, 900),
      moderate: between(r, 10, 40),
      vigorous: between(r, 0, 25),
      peak: between(r, 0, 8),
    },
    curveToday,
  }
}

function sleepNightFor(date: string): SleepNight {
  const n = nightFor(date)
  const r = rng(`sleep:${date}`)
  const bed = parseLocalDate(addDays(date, -1))
  bed.setHours(22, between(r, 30, 110), 0, 0)
  const total = n.sleepMin + between(r, 5, 25)
  const end = new Date(bed.getTime() + total * 60_000)

  // ~90-minute cycles: light → deep (early nights) → light → REM, with brief wakes
  const segments: SleepSegment[] = []
  let t = 0
  let cycle = 0
  const push = (stage: SleepSegment['stage'], len: number) => {
    if (t >= total || len <= 0) return
    const endMin = Math.min(total, t + len)
    segments.push({ stage, startMin: t, endMin })
    t = endMin
  }
  push('awake', between(r, 4, 14))
  while (t < total) {
    const deepLen = Math.max(0, Math.round((35 - cycle * 9) * (0.7 + r() * 0.6)))
    push('light', between(r, 20, 40))
    push('deep', deepLen)
    push('light', between(r, 10, 25))
    push('rem', between(r, 10 + cycle * 6, 25 + cycle * 8))
    if (r() < 0.45) push('awake', between(r, 1, 6))
    cycle++
  }

  return {
    date,
    start: bed.toISOString(),
    end: end.toISOString(),
    asleepMin: n.sleepMin - n.stages.awake,
    awakeMin: n.stages.awake,
    toFallAsleepMin: segments[0]?.endMin ?? null,
    stages: n.stages,
    segments,
  }
}

function vitalsFor(date: string): VitalsSection {
  const days = datesInRange(addDays(date, -29), date)
  return {
    spo2: days.map((d) => {
      const r = rng(`spo2:${d}`)
      const avg = round1(95.5 + r() * 2.5)
      return { date: d, avg, low: round1(avg - 1 - r() * 2), high: round1(Math.min(100, avg + 0.5 + r())) }
    }),
    breathing: days.map((d) => ({ date: d, bpm: round1(13 + rng(`breath:${d}`)() * 4) })),
    skinTemp: days.map((d) => ({ date: d, deltaC: round1((rng(`temp:${d}`)() - 0.5) * 1.2) || 0 })),
    weight: [
      { date: addDays(date, -40), kg: 89.4 },
      { date: addDays(date, -12), kg: 88.6 },
    ],
  }
}

export function mockBodySection<S extends BodySectionId>(
  section: S,
  date: string,
  today: string,
  now: Date,
): BodySectionData[S] {
  const data: { [K in BodySectionId]: () => BodySectionData[K] } = {
    activity: () => datesInRange(addDays(date, -29), date).map((d) => activityFor(d, today, now)),
    heart: () => heartFor(date, today, now),
    sleep: () => ({ nights: datesInRange(addDays(date, -13), date).map(sleepNightFor) }),
    vitals: () => vitalsFor(date),
  }
  return data[section]() as BodySectionData[S]
}
