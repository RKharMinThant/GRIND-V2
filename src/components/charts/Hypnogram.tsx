import { formatClock } from '../../health/bodyLogic'
import type { SleepNight, SleepSegment } from '../../health/types'

const LANES: { stage: SleepSegment['stage']; label: string }[] = [
  { stage: 'awake', label: 'Awake' },
  { stage: 'rem', label: 'REM' },
  { stage: 'light', label: 'Light' },
  { stage: 'deep', label: 'Deep' },
]

/** Sleep stages over the night, one lane per stage. */
export function Hypnogram({ night }: { night: SleepNight }) {
  const total = Math.max(1, (Date.parse(night.end) - Date.parse(night.start)) / 60_000)
  if (!night.segments.length) return <p className="chart-empty">No stage data for this night.</p>

  return (
    <div className="hypnogram">
      <div className="hypnogram-plot" role="img" aria-label={`Sleep stages from ${formatClock(night.start)} to ${formatClock(night.end)}`}>
        {LANES.map((lane) => (
          <div key={lane.stage} className="hypnogram-lane">
            <span className="hypnogram-lane-label">{lane.label}</span>
            <div className="hypnogram-track">
              {night.segments
                .filter((s) => s.stage === lane.stage)
                .map((s) => (
                  <span
                    key={s.startMin}
                    className={`hypnogram-seg stage-${s.stage}`}
                    style={{ left: `${(s.startMin / total) * 100}%`, width: `${Math.max(0.4, ((s.endMin - s.startMin) / total) * 100)}%` }}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="hypnogram-axis" aria-hidden>
        <span>{formatClock(night.start)}</span>
        <span>{formatClock(night.end)}</span>
      </div>
    </div>
  )
}
