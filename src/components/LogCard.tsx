import type { CSSProperties } from 'react'
import { friendlyDateShort } from '../lib/dates'
import { formatGrams, parseFocusAreas, type Log } from '../types/database'

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

  const tags: { key: string; label: string; kind: string }[] = []
  if (log.workout_type) tags.push({ key: 'type', label: log.workout_type, kind: 'type' })
  if (protein) tags.push({ key: 'p', label: `P ${protein}`, kind: 'supp' })
  if (creatine) tags.push({ key: 'cr', label: `Cr ${creatine}`, kind: 'supp' })
  if (log.meal) tags.push({ key: 'meal', label: 'Meal', kind: 'meal' })
  // Only list focuses in tags when there's no long title already from focuses
  const titleIsFocusList =
    focuses.length > 0 &&
    (log.workout === focuses.join(' · ') || log.workout === focuses.join(','))
  if (!titleIsFocusList) {
    focuses.slice(0, 2).forEach((f) => tags.push({ key: f, label: f, kind: 'focus' }))
    if (focuses.length > 2) {
      tags.push({ key: 'more', label: `+${focuses.length - 2}`, kind: 'focus' })
    }
  }

  return (
    <button
      type="button"
      className={`log-card ${hasPhoto ? 'log-card--photo' : 'log-card--plain'}`}
      onClick={() => onOpen(log.id)}
      style={
        {
          ...style,
          ...(staggerMs != null ? { ['--stagger' as string]: `${staggerMs}ms` } : null),
        } as CSSProperties
      }
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
