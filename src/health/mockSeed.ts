import { addDays, parseLocalDate } from '../lib/dates'
import type { HealthWorkout } from './types'

/** Deterministic 0..1 generator seeded by a string (FNV-1a hash → mulberry32). */
export function rng(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const between = (r: () => number, lo: number, hi: number) => Math.round(lo + r() * (hi - lo))

export function datesInRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export function workoutFor(date: string): HealthWorkout {
  const r = rng(`workout:${date}`)
  const pick = r()
  const activity = pick < 0.6 ? 'Weights' : pick < 0.78 ? 'Run' : pick < 0.9 ? 'HIIT' : 'Walk'
  const durationMin = between(r, 30, 90)
  const startMin = between(r, 6 * 60, 8 * 60)
  const day = parseLocalDate(date)
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, startMin)
  const end = new Date(start.getTime() + durationMin * 60_000)
  const avgHr = between(r, 105, 150)
  const peak = between(r, 0, Math.round(durationMin * 0.1))
  const cardio = between(r, 5, Math.round(durationMin * 0.35))
  return {
    id: `demo-${date}`,
    start: start.toISOString(),
    end: end.toISOString(),
    durationMin,
    activity,
    calories: between(r, 180, 650),
    avgHr,
    maxHr: avgHr + between(r, 20, 45),
    zoneMinutes: {
      fatBurn: Math.max(0, durationMin - cardio - peak - between(r, 0, 8)),
      cardio,
      peak,
    },
  }
}

export function nightFor(date: string) {
  const r = rng(`night:${date}`)
  const sleepMin = between(r, 300, 510)
  const deep = Math.round(sleepMin * (0.12 + r() * 0.08))
  const rem = Math.round(sleepMin * (0.18 + r() * 0.07))
  const awake = Math.round(sleepMin * (0.04 + r() * 0.05))
  return {
    sleepMin,
    stages: { deep, rem, awake, light: sleepMin - deep - rem - awake },
    restingHr: between(r, 52, 66),
    hrvMs: between(r, 30, 70),
  }
}

/** Daily steps for a date; today's count grows through the day. */
export function stepsFor(date: string, today: string, now: Date): number {
  const steps = between(rng(`steps:${date}`), 2000, 16000)
  if (date !== today) return steps
  const dayFraction = Math.min(1, (now.getHours() + now.getMinutes() / 60) / 21)
  return Math.round(steps * dayFraction)
}
