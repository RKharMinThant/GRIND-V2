import { useMemo, useState } from 'react'
import { toLocalDateString } from '../lib/dates'
import { countByDate } from '../lib/streaks'

type Props = {
  logDates: string[]
}

export function Heatmap({ logDates }: Props) {
  const today = toLocalDateString()
  const counts = useMemo(() => countByDate(logDates), [logDates])
  const [open, setOpen] = useState(true)

  const columns = useMemo(() => {
    const start = new Date()
    start.setDate(start.getDate() - 111)
    while (start.getDay() !== 0) start.setDate(start.getDate() - 1)

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
  }, [counts, today])

  return (
    <div className="section-block">
      <button
        type="button"
        className={`section-toggle ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="label" style={{ color: 'var(--muted)' }}>
          Activity · 16 weeks
        </span>
        <span className="chev">▼</span>
      </button>
      {open && (
        <div className="heatmap-card">
          <div className="heatmap-wrap">
            <div className="heatmap" role="img" aria-label="Activity heatmap">
              {columns.map((col, i) => (
                <div className="heatmap-col" key={i}>
                  {col.map((cell) => {
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
            Less
            <span className="swatch" style={{ background: 'var(--surface-2)' }} />
            <span className="swatch" style={{ background: 'rgba(200,241,53,0.22)' }} />
            <span className="swatch" style={{ background: 'rgba(200,241,53,0.5)' }} />
            <span className="swatch" style={{ background: 'var(--accent)' }} />
            More
          </div>
        </div>
      )}
    </div>
  )
}
