import { describe, expect, it } from 'vitest'
import { logsToCsv } from './exportData'
import type { Log } from '../types/database'

const log = (p: Partial<Log>): Log =>
  ({
    id: 'a',
    user_id: 'u',
    log_date: '2026-09-18',
    workout: 'Chest',
    workout_type: 'Strength',
    focus_areas: 'Chest,Triceps',
    duration: '1h 15m',
    meal: null,
    notes: null,
    protein_g: null,
    creatine_g: null,
    photo_path: null,
    created_at: '',
    updated_at: '',
    health_source: null,
    health_workout_id: null,
    calories_kcal: null,
    avg_hr: null,
    max_hr: null,
    hr_zone_minutes: null,
    ...p,
  }) as Log

describe('logsToCsv', () => {
  it('writes a header and one row per log, oldest first', () => {
    const csv = logsToCsv([log({ log_date: '2026-09-18' }), log({ id: 'b', log_date: '2026-09-17' })])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe(
      'date,workout,type,focus_areas,duration,protein_g,creatine_g,calories_kcal,avg_hr,max_hr,meal,notes',
    )
    expect(lines).toHaveLength(3)
    expect(lines[1].startsWith('2026-09-17')).toBe(true)
  })

  it('quotes fields containing commas, quotes or newlines', () => {
    const csv = logsToCsv([log({ notes: 'felt "great", tired', meal: 'rice\nchicken' })])
    expect(csv).toContain('"felt ""great"", tired"')
    expect(csv).toContain('"rice\nchicken"')
  })

  it('handles an empty journal', () => {
    expect(logsToCsv([]).trim().split('\n')).toHaveLength(1)
  })
})
