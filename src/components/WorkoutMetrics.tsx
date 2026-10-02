import type { LogHealthFields } from '../health/types'

type Props = {
  fields: LogHealthFields
}

/**
 * Tracker workout stats as chips coloured by category: calories (strength), heart rate (heart),
 * zone minutes (activity). Renders nothing when no workout is linked.
 */
export function WorkoutMetrics({ fields }: Props) {
  if (!fields.health_workout_id) return null
  const z = fields.hr_zone_minutes
  const zoneTotal = z ? z.fatBurn + z.cardio + z.peak : 0

  const chips: { key: string; tone: 'heart' | 'activity' | 'strength'; value: string; unit: string }[] = []
  if (fields.calories_kcal != null) {
    chips.push({ key: 'kcal', tone: 'strength', value: String(fields.calories_kcal), unit: 'kcal' })
  }
  if (fields.avg_hr != null) {
    chips.push({ key: 'avg', tone: 'heart', value: String(fields.avg_hr), unit: 'bpm avg' })
  }
  if (fields.max_hr != null) {
    chips.push({ key: 'max', tone: 'heart', value: String(fields.max_hr), unit: 'bpm max' })
  }
  if (zoneTotal > 0) {
    chips.push({ key: 'zone', tone: 'activity', value: String(zoneTotal), unit: 'zone min' })
  }

  if (!chips.length) return <span className="sheet-workout-sub">Linked to Fitbit</span>
  return (
    <div className="metric-chips">
      {chips.map((c) => (
        <span key={c.key} className={`metric-chip metric-chip--${c.tone}`}>
          <span className="num">{c.value}</span> {c.unit}
        </span>
      ))}
    </div>
  )
}
