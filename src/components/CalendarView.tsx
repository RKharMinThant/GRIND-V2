import { useMemo, useState, type ReactNode } from 'react'
import { daysInMonth, friendlyDate, monthTitle, toLocalDateString } from '../lib/dates'
import type { Log } from '../types/database'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Props = {
  logs: Log[]
  onOpenLog: (id: string) => void
  onCreateForDate: (date: string) => void
}

export function CalendarView({ logs, onOpenLog, onCreateForDate }: Props) {
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
    const count = dayLogs.length
    const has = count > 0
    const isToday = ds === today
    const intensity = count >= 3 ? 'l3' : count === 2 ? 'l2' : has ? 'l1' : ''

    cells.push(
      <button
        type="button"
        key={ds}
        className={`cal-cell ${has ? `has-log ${intensity}` : ''} ${isToday ? 'today' : ''} ${
          selected === ds ? 'selected' : ''
        }`}
        title={ds}
        onClick={() => setSelected(ds)}
      >
        {day}
      </button>,
    )
  }

  const selectedLogs = selected ? byDate.get(selected) ?? [] : []

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Calendar</div>
      </div>
      <div className="cal-card">
        <div className="cal-nav">
          <button type="button" className="btn btn-icon" onClick={() => changeMonth(-1)} aria-label="Previous month">
            ←
          </button>
          <div className="cal-month">{monthTitle(year, month)}</div>
          <button type="button" className="btn btn-icon" onClick={() => changeMonth(1)} aria-label="Next month">
            →
          </button>
        </div>
        <div className="cal-grid">
          {DOW.map((d) => (
            <div key={d} className="cal-dow">
              {d}
            </div>
          ))}
          {cells}
        </div>

        {selected && (
          <div className="cal-day-panel">
            <h3>{friendlyDate(selected)}</h3>
            {selectedLogs.length === 0 ? (
              <div>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: 12 }}>
                  No session on this day.
                </p>
                <button type="button" className="btn btn-primary" onClick={() => onCreateForDate(selected)}>
                  Log this day
                </button>
              </div>
            ) : (
              selectedLogs.map((log) => (
                <button
                  key={log.id}
                  type="button"
                  className="cal-day-item"
                  onClick={() => onOpenLog(log.id)}
                >
                  <strong>{log.workout}</strong>
                  <span>{[log.duration, log.workout_type].filter(Boolean).join(' · ') || 'Open detail'}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
