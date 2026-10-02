import { useMemo, useState, type ReactNode } from 'react'
import { daysInMonth, friendlyDate, monthTitle, toLocalDateString } from '../lib/dates'
import { isRestLog, type Log } from '../types/database'

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type Props = {
  logs: Log[]
  onOpenLog: (id: string) => void
  onCreateForDate: (date: string) => void
  /** Inside a sheet: no page wrapper or title */
  embedded?: boolean
}

export function CalendarView({ logs, onOpenLog, onCreateForDate, embedded }: Props) {
  const today = toLocalDateString()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState<string | null>(null)

  const byDate = useMemo(() => {
    const map = new Map<string, Log[]>()
    for (const l of logs) {
      const list = map.get(l.log_date) ?? []
      list.push(l)
      map.set(l.log_date, list)
    }
    return map
  }, [logs])

  function changeMonth(delta: number) {
    let m = month + delta
    let y = year
    if (m > 11) {
      m = 0
      y += 1
    }
    if (m < 0) {
      m = 11
      y -= 1
    }
    setMonth(m)
    setYear(y)
    setSelected(null)
  }

  const firstDow = new Date(year, month, 1).getDay()
  const total = daysInMonth(year, month)
  const cells: ReactNode[] = []

  for (let i = 0; i < firstDow; i++) {
    cells.push(<div key={`f-${i}`} className="cal-cell filler" />)
  }

  for (let day = 1; day <= total; day++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dayLogs = byDate.get(ds) ?? []
    const has = dayLogs.length > 0
    // A day counts as a session unless every entry on it is a rest day
    const restOnly = has && dayLogs.every((l) => isRestLog(l.workout))
    const mark = !has ? '' : restOnly ? 'rest' : 'session'
    const isToday = ds === today

    cells.push(
      <button
        type="button"
        key={ds}
        className={`cal-cell ${mark ? `has-log cal-cell--${mark}` : ''} ${isToday ? 'today' : ''} ${
          selected === ds ? 'selected' : ''
        }`}
        title={ds}
        aria-label={`${friendlyDate(ds)}${
          mark === 'session' ? ', session logged' : mark === 'rest' ? ', rest day' : ''
        }`}
        aria-pressed={selected === ds}
        onClick={() => setSelected(ds)}
      >
        <span className="cal-day num">{day}</span>
        <span className="cal-dot" aria-hidden />
      </button>,
    )
  }

  const selectedLogs = selected ? byDate.get(selected) ?? [] : []

  return (
    <div className={embedded ? 'calendar-embedded' : 'page calendar-page'}>
      {!embedded && (
        <div className="page-header">
          <div className="page-title">Calendar</div>
        </div>
      )}
      <div className="card cal-card">
        <div className="cal-nav">
          <button type="button" className="btn btn-icon" onClick={() => changeMonth(-1)} aria-label="Previous month">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="m15 5-7 7 7 7" />
            </svg>
          </button>
          <div className="cal-month t-title2">{monthTitle(year, month)}</div>
          <button type="button" className="btn btn-icon" onClick={() => changeMonth(1)} aria-label="Next month">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="m9 5 7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="cal-grid">
          {DOW.map((d, i) => (
            <div key={i} className="cal-dow t-caption" aria-label={DOW_NAMES[i]}>
              {d}
            </div>
          ))}
          {cells}
        </div>

        {selected && (
          <div className="cal-day-panel">
            <h3 className="t-headline">{friendlyDate(selected)}</h3>
            {selectedLogs.length === 0 ? (
              <div className="cal-day-empty">
                <p className="t-subhead">No session on this day.</p>
                <button type="button" className="btn btn-primary btn-full" onClick={() => onCreateForDate(selected)}>
                  Log this day
                </button>
              </div>
            ) : (
              <div className="cal-day-list">
                {selectedLogs.map((log) => (
                  <button
                    key={log.id}
                    type="button"
                    className="cal-day-item"
                    onClick={() => onOpenLog(log.id)}
                  >
                    <span className="cal-day-item-main">
                      <span className="cal-day-item-title t-body">{log.workout}</span>
                      <span className="cal-day-item-meta t-footnote">
                        {[log.duration, log.workout_type].filter(Boolean).join(' · ') || 'Open detail'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
