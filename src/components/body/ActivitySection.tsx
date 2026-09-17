import { useMemo, useState } from 'react'
import { formatKm, lastNDays } from '../../health/bodyLogic'
import type { HealthState } from '../../health/useHealth'
import { useBodySection } from '../../health/useBodySection'
import { toLocalDateString } from '../../lib/dates'
import { StackedBar } from '../charts/StackedBar'
import { StepBars } from '../charts/StepBars'
import { SectionFrame } from './SectionFrame'

type Props = { health: HealthState; stepGoal: number }

export function ActivitySection({ health, stepGoal }: Props) {
  const { data, loading, error, retry } = useBodySection(health, 'activity')
  const [range, setRange] = useState<7 | 30>(7)
  const today = toLocalDateString()

  const days = useMemo(() => lastNDays(data ?? [], range, today), [data, range, today])
  const present = days.filter((d): d is NonNullable<typeof d> => d !== null)
  const withSteps = present.filter((d) => d.steps != null)
  const avgSteps = withSteps.length
    ? Math.round(withSteps.reduce((a, d) => a + (d.steps ?? 0), 0) / withSteps.length)
    : null
  const totalKm = present.reduce((a, d) => a + (d.distanceKm ?? 0), 0)
  const totalAzm = present.reduce((a, d) => a + (d.azm ? d.azm.fatBurn + d.azm.cardio + d.azm.peak : 0), 0)
  const latest = data?.[data.length - 1]
  const floors = latest?.floors ?? null

  return (
    <SectionFrame
      title="Activity"
      loading={loading}
      error={error}
      empty={!data?.length}
      onRetry={retry}
      meta={
        <div className="mode-seg" role="group" aria-label="Range">
          {([7, 30] as const).map((r) => (
            <button key={r} type="button" className={range === r ? 'active' : ''} onClick={() => setRange(r)} aria-pressed={range === r}>
              {r}d
            </button>
          ))}
        </div>
      }
    >
      <StepBars key={range} days={days} goal={stepGoal} />

      <div className="body-stats">
        <div>
          <span className="label">Avg steps</span>
          <span className="body-stat-value">{avgSteps?.toLocaleString() ?? '—'}</span>
        </div>
        <div>
          <span className="label">Distance</span>
          <span className="body-stat-value">{formatKm(present.length ? Math.round(totalKm * 10) / 10 : null)}</span>
        </div>
        <div>
          <span className="label">Zone min</span>
          <span className="body-stat-value">{present.length ? totalAzm : '—'}</span>
        </div>
      </div>

      {latest?.activeMin && (
        <div className="body-block">
          <div className="body-block-title">
            Active minutes today{floors ? <span> · {floors} floors</span> : null}
          </div>
          <StackedBar
            ariaLabel="Active minutes today by intensity"
            parts={[
              { label: 'Light', value: latest.activeMin.light, tone: 'accent-soft' },
              { label: 'Moderate', value: latest.activeMin.moderate, tone: 'accent' },
              { label: 'Vigorous', value: latest.activeMin.vigorous, tone: 'danger' },
            ]}
          />
        </div>
      )}
    </SectionFrame>
  )
}
