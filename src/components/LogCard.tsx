import type { CSSProperties } from 'react'
import { friendlyDateShort } from '../lib/dates'
import { formatGrams, isRestLog, parseFocusAreas, type Log } from '../types/database'

type Props = {
  log: Log
  photoUrl?: string
  onOpen: (id: string) => void
  style?: CSSProperties
  staggerMs?: number
}

export function LogCard({ log, photoUrl, onOpen, style, staggerMs }: Props) {
  const focuses = parseFocusAreas(log.focus_areas)
  const protein = formatGrams(log.protein_g)
  const creatine = formatGrams(log.creatine_g)
  const hasPhoto = Boolean(photoUrl)

  const meta = [log.duration, log.workout_type].filter(Boolean).join(' · ')
  const focusPreview =
    focuses.length === 0
      ? null
      : focuses.length <= 2
        ? focuses.join(' · ')
        : `${focuses.slice(0, 2).join(' · ')} +${focuses.length - 2}`

  const rest = isRestLog(log.workout)
  const tags: { key: string; label: string; kind: string }[] = []
  if (rest) tags.push({ key: 'rest', label: 'Rest', kind: 'rest' })
  if (log.workout_type) tags.push({ key: 'type', label: log.workout_type, kind: 'type' })
  if (protein) tags.push({ key: 'p', label: `P ${protein}`, kind: 'supp' })
  if (creatine) tags.push({ key: 'cr', label: `Cr ${creatine}`, kind: 'supp' })
  if (log.meal) tags.push({ key: 'meal', label: 'Meal', kind: 'meal' })
  // Only list focuses in tags when there's no long title already from focuses
  const titleIsFocusList =
    focuses.length > 0 &&
    (log.workout === focuses.join(' · ') || log.workout === focuses.join(','))
  if (!titleIsFocusList && !rest) {
    focuses.slice(0, 2).forEach((f) => tags.push({ key: f, label: f, kind: 'focus' }))
    if (focuses.length > 2) {
      tags.push({ key: 'more', label: `+${focuses.length - 2}`, kind: 'focus' })
    }
  }

  const frameStyle = {
    ...style,
    ...(staggerMs != null ? { ['--stagger' as string]: `${staggerMs}ms` } : null),
  } as CSSProperties

  // Dedicated recovery card — not the empty “session” placeholder
  if (rest && !hasPhoto) {
    return (
      <button
        type="button"
        className="log-card log-card--rest"
        onClick={() => onOpen(log.id)}
        style={frameStyle}
      >
        <div className="rest-card-glow" aria-hidden />
        <div className="rest-card-inner">
          <div className="rest-card-top">
            <span className="rest-card-date">{friendlyDateShort(log.log_date)}</span>
            <span className="rest-card-pill">Recovery</span>
          </div>
          <div className="rest-card-icon" aria-hidden>
            <svg viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
              <rect x="17" y="15" width="5" height="18" rx="1.5" fill="currentColor" />
              <rect x="26" y="15" width="5" height="18" rx="1.5" fill="currentColor" />
            </svg>
          </div>
          <div className="rest-card-title">Rest day</div>
          <p className="rest-card-copy">Recovery counts. Come back stronger.</p>
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      className={`log-card ${hasPhoto ? 'log-card--photo' : 'log-card--plain'}${
        rest ? ' log-card--rest-photo' : ''
      }`}
      onClick={() => onOpen(log.id)}
      style={frameStyle}
    >
      {hasPhoto ? (
        <div className="log-card-media">
          <img src={photoUrl} alt="" loading="lazy" />
          <div className="log-card-scrim" />
          <div className="log-card-overlay">
            <div className="log-card-date">{friendlyDateShort(log.log_date)}</div>
            <div className="log-card-title">{log.workout}</div>
            {(meta || focusPreview) && (
              <div className="log-card-meta">
                {[meta, !titleIsFocusList ? focusPreview : null].filter(Boolean).join(' · ')}
              </div>
            )}
            {tags.length > 0 && (
              <div className="tags tags--on-media">
                {tags.map((t) => (
                  <span key={t.key} className={`tag ${t.kind}`}>
                    {t.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="log-card-media log-card-media--empty">
            <div className="ph">{log.workout_type || focuses[0] || 'Session'}</div>
          </div>
          <div className="log-card-body">
            <div className="log-card-date">{friendlyDateShort(log.log_date)}</div>
            <div className="log-card-title">{log.workout}</div>
            {meta && <div className="log-card-meta">{meta}</div>}
            {tags.length > 0 && (
              <div className="tags">
                {tags.map((t) => (
                  <span key={t.key} className={`tag ${t.kind}`}>
                    {t.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </button>
  )
}
