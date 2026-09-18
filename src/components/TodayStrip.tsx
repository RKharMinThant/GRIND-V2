import { stepGoalProgress } from '../health/bodyLogic'
import { DEFAULT_DISTANCE_UNIT, formatDistance, type DistanceUnit } from '../lib/units'
import { formatSleep } from '../health/logic'
import type { HealthRecovery, TodaySummary } from '../health/types'
import { Ring } from './charts/Ring'

type Props = {
  today: TodaySummary | null
  recovery: HealthRecovery | null
  stepGoal: number
  distanceUnit?: DistanceUnit
  onOpen: () => void
}

/** Home glance: steps ring plus zone minutes, distance, calories and last night's sleep. */
export function TodayStrip({ today, recovery, stepGoal, distanceUnit = DEFAULT_DISTANCE_UNIT, onOpen }: Props) {
  const steps = today?.steps ?? null
  const progress = stepGoalProgress(steps, stepGoal)
  const goalLabel = stepGoal >= 1000 ? `of ${Math.round(stepGoal / 100) / 10}k` : `of ${stepGoal}`
  const tiles = [
    { label: 'Zone min', value: today?.zoneMinutes != null ? String(today.zoneMinutes) : '—' },
    { label: 'Distance', value: formatDistance(today?.distanceKm ?? null, distanceUnit) },
    { label: 'Calories', value: today?.calories != null ? today.calories.toLocaleString() : '—' },
    { label: 'Sleep', value: recovery?.sleepMin != null ? formatSleep(recovery.sleepMin) : '—' },
  ]

  return (
    <button type="button" className="health-card today-strip" onClick={onOpen} aria-label="Open Body">
      <div className="health-card-kicker">
        <span>Today</span>
        <span className="today-strip-more">Body →</span>
      </div>
      <div className="today-strip-row">
        <Ring
          progress={progress}
          size={92}
          label={steps != null ? steps.toLocaleString() : '—'}
          sublabel={goalLabel}
          ariaLabel={`${steps?.toLocaleString() ?? 'No'} steps, ${Math.round(progress * 100)}% of your ${stepGoal.toLocaleString()} step goal`}
        />
        <div className="today-strip-tiles">
          {tiles.map((t) => (
            <div key={t.label} className="today-tile">
              <span className="label">{t.label}</span>
              <span className="today-tile-value">{t.value}</span>
            </div>
          ))}
        </div>
      </div>
    </button>
  )
}
