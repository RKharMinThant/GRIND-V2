import { useMemo, useState } from 'react'
import { monthKey, monthLabelFromKey } from '../lib/dates'
import type { Log } from '../types/database'
import { WORKOUT_TYPES } from '../types/database'
import { LogCard } from './LogCard'

type Props = {
  logs: Log[]
  photoUrls: Record<string, string>
  onOpenLog: (id: string) => void
  onOpenCalendar?: () => void
}

export function LogsList({ logs, photoUrls, onOpenLog, onOpenCalendar }: Props) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return logs.filter((l) => {
      if (typeFilter !== 'all' && l.workout_type !== typeFilter) return false
      if (!q) return true
      return (
        l.workout.toLowerCase().includes(q) ||
        (l.meal?.toLowerCase().includes(q) ?? false) ||
        (l.notes?.toLowerCase().includes(q) ?? false) ||
        (l.workout_type?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [logs, query, typeFilter])

  const groups = useMemo(() => {
    const map = new Map<string, Log[]>()
    for (const log of filtered) {
      const key = monthKey(log.log_date)
      const list = map.get(key) ?? []
      list.push(log)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [filtered])

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">History</div>
        <div className="page-header-actions">
          <div className="label">
            {filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}
          </div>
          {onOpenCalendar && (
            <button
              type="button"
              className="btn btn-ghost btn-sm history-calendar-btn"
              onClick={onOpenCalendar}
              aria-label="Open calendar"
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M16 3v4M8 3v4M3 11h18" />
              </svg>
              Calendar
            </button>
          )}
        </div>
      </div>

      <input
        className="search-input"
        type="search"
        placeholder="Search workouts, fuel, notes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="filter-row">
        <button
          type="button"
          className={`filter-chip ${typeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setTypeFilter('all')}
        >
          All
        </button>
        {WORKOUT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`filter-chip ${typeFilter === t ? 'active' : ''}`}
            onClick={() => setTypeFilter(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="empty">
          <div className="empty-mark">—</div>
          <h3>Nothing here</h3>
          <p>
            {logs.length === 0
              ? 'Log a session to build your journal.'
              : 'No entries match this filter.'}
          </p>
        </div>
      ) : (
        groups.map(([key, items]) => (
          <div className="month-group" key={key}>
            <div className="month-group-title">{monthLabelFromKey(key)}</div>
            <div className="logs-grid three-col">
              {items.map((log) => (
                <LogCard key={log.id} log={log} photoUrl={photoUrls[log.id]} onOpen={onOpenLog} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
