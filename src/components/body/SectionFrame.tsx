import type { ReactNode } from 'react'

type Props = {
  title: string
  meta?: ReactNode
  loading: boolean
  error: string | null
  empty: boolean
  onRetry: () => void
  children: ReactNode
}

/** Section header + card for a Body section: skeleton while loading, inline retry on error, hidden when empty. */
export function SectionFrame({ title, meta, loading, error, empty, onRetry, children }: Props) {
  if (!loading && !error && empty) return null
  return (
    <section className="body-section" aria-label={title} aria-busy={loading}>
      <div className="section-header">
        <h2>{title}</h2>
        {meta && <div className="body-section-meta">{meta}</div>}
      </div>
      <div className="card body-card">
        {error ? (
          <div className="body-section-error">
            <span>
              Couldn't load {title.toLowerCase()}
              <small>{error}</small>
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : loading && empty ? (
          <div className="body-skeleton" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
