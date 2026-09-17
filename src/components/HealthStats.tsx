import type { LogHealthFields } from '../health/types'

type Props = {
  fields: LogHealthFields
  /** One line of facts only (form chip, review row) */
  compact?: boolean
}

/** Tracker workout stats saved on a session. Renders nothing when no workout is linked. */
export function HealthStats({ fields, compact }: Props) {
  if (!fields.health_workout_id) return null
  const z = fields.hr_zone_minutes
  const zTotal = z ? z.fatBurn + z.cardio + z.peak : 0
  const facts = [
    fields.calories_kcal != null ? `${fields.calories_kcal} kcal` : null,
    fields.avg_hr != null ? `avg ${fields.avg_hr} bpm` : null,
    fields.max_hr != null ? `max ${fields.max_hr}` : null,
  ].filter(Boolean)

  return (
    <div className={`health-stats${compact ? ' compact' : ''}`}>
      <div className="health-stats-facts">{facts.join(' · ') || 'Linked to Fitbit'}</div>
      {!compact && z && zTotal > 0 && (
        <>
          <div
            className="zone-bar"
            role="img"
            aria-label={`Fat burn ${z.fatBurn} min, cardio ${z.cardio} min, peak ${z.peak} min`}
          >
            <span className="zone-seg fat" style={{ width: `${(z.fatBurn / zTotal) * 100}%` }} />
            <span className="zone-seg cardio" style={{ width: `${(z.cardio / zTotal) * 100}%` }} />
            <span className="zone-seg peak" style={{ width: `${(z.peak / zTotal) * 100}%` }} />
          </div>
          <div className="zone-legend">
            <span className="fat">Fat burn {z.fatBurn}m</span>
            <span className="cardio">Cardio {z.cardio}m</span>
            <span className="peak">Peak {z.peak}m</span>
          </div>
        </>
      )}
      {fields.health_source === 'demo' && !compact && <div className="health-stats-demo">Demo data</div>}
    </div>
  )
}
