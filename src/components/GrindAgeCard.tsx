import type { GrindAgeState } from '../hooks/useGrindAge'
import { ageGapLabel, formatPace } from '../health/grindAge'

type Props = {
  grindAge: GrindAgeState
  onOpen: () => void
  onOpenSettings: () => void
}

/** Home card for GRIND Age. Only mounted while Fitbit is connected. */
export function GrindAgeCard({ grindAge, onOpen, onOpenSettings }: Props) {
  const { data, loading, error, refresh } = grindAge

  if (!data) {
    if (error) {
      return (
        <section className="health-card grind-age-card" aria-label="GRIND Age">
          <div className="grind-age-line">
            <span>Couldn’t load your GRIND Age.</span>
            <button type="button" className="link-btn" onClick={() => void refresh()} disabled={loading}>
              Retry
            </button>
          </div>
        </section>
      )
    }
    return (
      <section className="health-card grind-age-card" aria-label="GRIND Age" aria-busy={loading}>
        <div className="grind-age-skeleton" aria-hidden>
          <span />
        </div>
      </section>
    )
  }

  if (data.status === 'needs_profile') {
    return (
      <section className="health-card grind-age-card" aria-label="GRIND Age">
        <div className="health-card-kicker">GRIND Age</div>
        <div className="grind-age-line">
          <span>Add your birth date and sex to see your GRIND Age</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenSettings}>
            Open Settings
          </button>
        </div>
      </section>
    )
  }

  if (data.status !== 'ok') return null

  return (
    <button
      type="button"
      className="health-card today-strip grind-age-card"
      onClick={onOpen}
      aria-label={`GRIND Age ${data.result.grindAge.toFixed(1)}. ${ageGapLabel(data.result)}. Open details`}
    >
      <div className="health-card-kicker">
        <span>GRIND Age</span>
        <span className="today-strip-more">Details →</span>
      </div>
      <div className="grind-age-main">
        <span className="grind-age-num">{data.result.grindAge.toFixed(1)}</span>
        <div className="grind-age-meta">
          <span>{ageGapLabel(data.result)}</span>
          {data.pace != null && <span className="grind-age-pace">Pace of aging {formatPace(data.pace)}</span>}
        </div>
      </div>
      {error && (
        <div className="grind-age-note" role="status">
          Couldn’t update just now.
        </div>
      )}
    </button>
  )
}
