import type { ReactNode } from 'react'
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

type Tile = {
  key: string
  label: string
  value: ReactNode
  unit?: string
  tone: 'activity' | 'sleep'
  icon: ReactNode
}

const ICONS = {
  zone: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" />,
  distance: (
    <>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6" />
    </>
  ),
  calories: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4 .2 1.4.8 2 1.6 2.4C10.2 8 10.8 5.5 12 3z" />,
  sleep: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
}

function TileIcon({ children }: { children: ReactNode }) {
  return (
    <svg className="today-tile-icon" viewBox="0 0 24 24" aria-hidden>
      {children}
    </svg>
  )
}

/** "7h 12m" → 7 h 12 m, with the letters set small like every other unit */
function sleepValue(text: string): ReactNode {
  return text.split(' ').map((part, i) => (
    <span key={i}>
      {part.slice(0, -1)}
      <small>{part.slice(-1)}</small>
      {i === 0 && text.includes(' ') ? ' ' : ''}
    </span>
  ))
}

/** Home glance: steps ring plus zone minutes, distance, calories and last night's sleep. */
export function TodayStrip({ today, recovery, stepGoal, distanceUnit = DEFAULT_DISTANCE_UNIT, onOpen }: Props) {
  const steps = today?.steps ?? null
  const progress = stepGoalProgress(steps, stepGoal)
  const goalLabel = stepGoal >= 1000 ? `of ${Math.round(stepGoal / 100) / 10}k` : `of ${stepGoal}`

  // Distance arrives as one string ("7.4 km"); split the unit so it can sit smaller beside the value
  const distance = formatDistance(today?.distanceKm ?? null, distanceUnit)
  const [distValue, ...distRest] = distance.split(' ')
  const sleep = recovery?.sleepMin != null ? sleepValue(formatSleep(recovery.sleepMin)) : null

  const tiles: Tile[] = [
    {
      key: 'zone',
      label: 'Zone min',
      value: today?.zoneMinutes != null ? String(today.zoneMinutes) : '—',
      unit: today?.zoneMinutes != null ? 'min' : undefined,
      tone: 'activity',
      icon: ICONS.zone,
    },
    {
      key: 'distance',
      label: 'Distance',
      value: distValue,
      unit: distRest.join(' ') || undefined,
      tone: 'activity',
      icon: ICONS.distance,
    },
    {
      key: 'calories',
      label: 'Calories',
      value: today?.calories != null ? today.calories.toLocaleString() : '—',
      unit: today?.calories != null ? 'kcal' : undefined,
      tone: 'activity',
      icon: ICONS.calories,
    },
    { key: 'sleep', label: 'Sleep', value: sleep ?? '—', tone: 'sleep', icon: ICONS.sleep },
  ]

  return (
    <section aria-label="Today">
      <div className="section-header">
        <h2>Today</h2>
        <button type="button" onClick={onOpen}>
          Body ›
        </button>
      </div>
      <button type="button" className="card today-strip" onClick={onOpen} aria-label="Open Body">
        <div className="today-strip-row">
          <Ring
            progress={progress}
            size={96}
            tone="activity"
            label={steps != null ? steps.toLocaleString() : '—'}
            sublabel={goalLabel}
            ariaLabel={`${steps?.toLocaleString() ?? 'No'} steps, ${Math.round(progress * 100)}% of your ${stepGoal.toLocaleString()} step goal`}
          />
          <div className="today-strip-tiles">
            {tiles.map((t) => (
              <div key={t.key} className={`today-tile tone-${t.tone}`}>
                <span className="today-tile-label">
                  <TileIcon>{t.icon}</TileIcon>
                  {t.label}
                </span>
                <span className="today-tile-value num">
                  {t.value}
                  {t.unit && <small>{t.unit}</small>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </button>
    </section>
  )
}
