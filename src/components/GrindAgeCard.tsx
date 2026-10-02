import type { GrindAgeState } from '../hooks/useGrindAge'
import { ageGapLabel, formatPace, type GrindAgeResult } from '../health/grindAge'

type Props = {
  grindAge: GrindAgeState
  onOpen: () => void
  onOpenSettings: () => void
}

/** Small arrow beside the age gap: up (red) when older than your real age, down (lime) when younger. */
export function GapArrow({ result }: { result: GrindAgeResult }) {
  const gap = Math.round((result.grindAge - result.chronologicalAge) * 10) / 10
  if (Math.abs(gap) < 0.05) return null
  const older = gap > 0
  return (
    <svg
      className={`ga-arrow ${older ? 'ga-arrow--older' : 'ga-arrow--younger'}`}
      viewBox="0 0 12 12"
      aria-hidden
    >
      {older ? <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" /> : <path d="M6 2v8M2.5 6.5 6 10l3.5-3.5" />}
    </svg>
  )
}

/** Home card for GRIND Age. Only mounted while Fitbit is connected. */
export function GrindAgeCard({ grindAge, onOpen, onOpenSettings }: Props) {
  const { data, loading, error, refresh } = grindAge

  if (!data) {
    if (error) {
      return (
        <section className="grind-age" aria-label="GRIND Age">
          <h2 className="section-header">GRIND Age</h2>
          <div className="card grind-age-card">
            <div className="grind-age-line">
              <span>Couldn’t load your GRIND Age.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refresh()} disabled={loading}>
                Retry
              </button>
            </div>
          </div>
        </section>
      )
    }
    return (
      <section className="grind-age" aria-label="GRIND Age" aria-busy={loading}>
        <h2 className="section-header">GRIND Age</h2>
        <div className="card grind-age-card">
          <div className="grind-age-skeleton" aria-hidden>
            <span />
            <span />
          </div>
        </div>
      </section>
    )
  }

  if (data.status === 'needs_profile') {
    return (
      <section className="grind-age" aria-label="GRIND Age">
        <h2 className="section-header">GRIND Age</h2>
        <div className="card grind-age-card">
          <div className="grind-age-line">
            <span>Add your birth date and sex to see your GRIND Age</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenSettings}>
              Open Settings
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (data.status !== 'ok') return null

  return (
    <section className="grind-age" aria-label="GRIND Age">
      <h2 className="section-header">GRIND Age</h2>
      <button
        type="button"
        className="card grind-age-card grind-age-card--button"
        onClick={onOpen}
        aria-label={`GRIND Age ${data.result.grindAge.toFixed(1)}. ${ageGapLabel(data.result)}. Open details`}
      >
        <span className="num t-large-title grind-age-num">{data.result.grindAge.toFixed(1)}</span>
        <span className="grind-age-meta">
          <span className="t-subhead grind-age-gap">
            <GapArrow result={data.result} />
            <span>{ageGapLabel(data.result)}</span>
          </span>
          {data.pace != null && <span className="chip">Pace of aging {formatPace(data.pace)}</span>}
        </span>
        <span className="grind-age-chevron" aria-hidden />
        {error && (
          <span className="grind-age-note" role="status">
            Couldn’t update just now.
          </span>
        )}
      </button>
    </section>
  )
}
