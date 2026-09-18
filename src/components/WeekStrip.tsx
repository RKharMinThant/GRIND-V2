import type { CSSProperties } from 'react'
import { addDays, parseLocalDate, startOfWeek, toLocalDateString, weekdayLabels } from '../lib/dates'
import { DEFAULT_WEEK_START, type WeekStart } from '../lib/units'

type Props = {
  logDates: string[]
  onDayClick: (date: string, hasLog: boolean) => void
  weekStart?: WeekStart
}

export function WeekStrip({ logDates, onDayClick, weekStart = DEFAULT_WEEK_START }: Props) {
  const today = toLocalDateString()
  const start = startOfWeek(today, weekStart)
  const labels = weekdayLabels(weekStart)
  const set = new Set(logDates)

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    return {
      date,
      label: labels[i],
      n: parseLocalDate(date).getDate(),
      logged: set.has(date),
      isToday: date === today,
    }
  })

  return (
    <div className="week-strip" aria-label="This week">
      {days.map((d, i) => (
        <button
          key={d.date}
          type="button"
          className={`week-day ${d.logged ? 'logged' : ''} ${d.isToday ? 'today' : ''}`}
          style={{ ['--i' as string]: i } as CSSProperties}
          title={d.logged ? `${d.date} · open log` : `${d.date} · log session`}
          onClick={() => onDayClick(d.date, d.logged)}
        >
          <span>{d.label}</span>
          <span className="n">{d.n}</span>
        </button>
      ))}
    </div>
  )
}
