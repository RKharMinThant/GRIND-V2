import { useMemo, useState } from 'react'
import { stepTier } from '../health/logic'
import { readJson, writeJson } from '../health/storage'
import type { DailySteps } from '../health/types'
import { toLocalDateString } from '../lib/dates'
import { DEFAULT_WEEK_START, type WeekStart } from '../lib/units'
import { countByDate } from '../lib/streaks'

type Mode = 'sessions' | 'steps'

const MODE_KEY = 'grind_heatmap_mode'

type Props = {
  logDates: string[]
  weekStart?: WeekStart
  /** Daily steps from the tracker; the Sessions | Steps switch shows only when present */
  steps?: DailySteps[]
}

export function Heatmap({ logDates, steps, weekStart = DEFAULT_WEEK_START }: Props) {
  const today = toLocalDateString()
  const counts = useMemo(() => countByDate(logDates), [logDates])
  const stepsByDate = useMemo(() => new Map(steps?.map((s) => [s.date, s.steps])), [steps])
  const [open, setOpen] = useState(true)
  const [mode, setMode] = useState<Mode>(() => readJson<Mode>(MODE_KEY, 'sessions'))
  const hasSteps = Boolean(steps?.length)
  const showSteps = hasSteps && mode === 'steps'

  function changeMode(next: Mode) {
    setMode(next)
    writeJson(MODE_KEY, next)
  }

  const columns = useMemo(() => {
    const start = new Date()
    start.setDate(start.getDate() - 111)
    while (start.getDay() !== weekStart) start.setDate(start.getDate() - 1)

    const cols: { date: string; count: number }[][] = []
    const cursor = new Date(start)
    while (toLocalDateString(cursor) <= today) {
      const col: { date: string; count: number }[] = []
      for (let d = 0; d < 7; d++) {
        const ds = toLocalDateString(cursor)
        if (ds > today) break
        col.push({ date: ds, count: counts.get(ds) ?? 0 })
        cursor.setDate(cursor.getDate() + 1)
      }
      if (col.length) cols.push(col)
    }
    return cols
  }, [counts, today, weekStart])

  return (
    <div className="section-block">
      <div className="section-head">
        <button
          type="button"
          className={`section-toggle ${open ? 'open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="label" style={{ color: 'var(--muted)' }}>
            {showSteps ? 'Steps' : 'Activity'} · 16 weeks
          </span>
          <span className="chev">▼</span>
        </button>
      </div>
      {open && (
        <div className="heatmap-card">
          {hasSteps && (
            <div className="mode-seg" role="group" aria-label="Heatmap data">
              {(['sessions', 'steps'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={mode === m ? 'active' : ''}
                  onClick={() => changeMode(m)}
                  aria-pressed={mode === m}
                >
                  {m === 'sessions' ? 'Sessions' : 'Steps'}
                </button>
              ))}
            </div>
          )}
          <div className="heatmap-wrap">
            <div
              className="heatmap"
              role="img"
              aria-label={showSteps ? 'Daily steps heatmap' : 'Activity heatmap'}
            >
              {columns.map((col, i) => (
                <div className="heatmap-col" key={i}>
                  {col.map((cell) => {
                    if (showSteps) {
                      const n = stepsByDate.get(cell.date) ?? 0
                      return (
                        <div
                          key={cell.date}
                          className={`heatmap-cell steps ${stepTier(n)}`}
                          title={`${cell.date} · ${n.toLocaleString()} steps`}
                        />
                      )
                    }
                    const level =
                      cell.count === 0 ? '' : cell.count === 1 ? 'l1' : cell.count === 2 ? 'l2' : 'l3'
                    return (
                      <div
                        key={cell.date}
                        className={`heatmap-cell ${level}`}
                        title={`${cell.date}${cell.count ? ` · ${cell.count}` : ''}`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="heatmap-legend">
            {showSteps ? 'Fewer steps' : 'Less'}
            <span className="swatch" style={{ background: 'var(--surface-2)' }} />
            <span className={`swatch ${showSteps ? 'steps-l1' : ''}`} style={showSteps ? undefined : { background: 'rgba(200,241,53,0.22)' }} />
            <span className={`swatch ${showSteps ? 'steps-l2' : ''}`} style={showSteps ? undefined : { background: 'rgba(200,241,53,0.5)' }} />
            <span className={`swatch ${showSteps ? 'steps-l3' : ''}`} style={showSteps ? undefined : { background: 'var(--accent)' }} />
            {showSteps ? 'More steps' : 'More'}
          </div>
        </div>
      )}
    </div>
  )
}
