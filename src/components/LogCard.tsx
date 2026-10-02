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

  const rest = isRestLog(log.workout)
  const titleIsFocusList =
    focuses.length > 0 &&
    (log.workout === focuses.join(' · ') || log.workout === focuses.join(','))

  // Footnote line: type and focus areas (skip focuses when the title already lists them)
  const focusPreview =
    focuses.length === 0 || titleIsFocusList
      ? null
      : focuses.length <= 2
        ? focuses.join(' · ')
        : `${focuses.slice(0, 2).join(' · ')} +${focuses.length - 2}`
  const detail = [log.workout_type, focusPreview].filter(Boolean).join(' · ')

  // Quiet extras: supplements, meal, heart rate
  const extras = [
    protein ? `P ${protein}` : null,
    creatine ? `Cr ${creatine}` : null,
    log.meal ? 'Meal' : null,
    log.avg_hr != null ? `${log.avg_hr} bpm` : null,
  ].filter(Boolean) as string[]

  const frameStyle = {
    ...style,
    ...(staggerMs != null ? { ['--stagger' as string]: `${staggerMs}ms` } : null),
  } as CSSProperties

  return (
    <button
      type="button"
      className={`list-row list-row--nav log-card${rest ? ' log-card--rest' : ''}${
        hasPhoto ? ' log-card--photo' : ''
      }`}
      onClick={() => onOpen(log.id)}
      style={frameStyle}
    >
      {hasPhoto && (
        <span className="log-card-media">
          <img src={photoUrl} alt="" loading="lazy" />
        </span>
      )}
      <span className="log-card-body">
        <span className="log-card-date t-subhead">{friendlyDateShort(log.log_date)}</span>
        <span className="log-card-title t-headline">{rest ? 'Rest day' : log.workout}</span>
        {rest ? (
          !hasPhoto && <span className="log-card-detail t-footnote">Recovery counts</span>
        ) : (
          <>
            {detail && <span className="log-card-detail t-footnote">{detail}</span>}
            {extras.length > 0 && (
              <span className="log-card-extras t-footnote">{extras.join(' · ')}</span>
            )}
          </>
        )}
      </span>
      {!rest && (log.duration || log.calories_kcal != null) && (
        <span className="log-card-side">
          {log.duration && <span className="log-card-duration num">{log.duration}</span>}
          {log.calories_kcal != null && (
            <span className="log-card-kcal t-footnote">
              <span className="num">{log.calories_kcal}</span> kcal
            </span>
          )}
        </span>
      )}
    </button>
  )
}
