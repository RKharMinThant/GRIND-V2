import type { CSSProperties } from 'react'
import { addDays, parseLocalDate, startOfWeekSunday, toLocalDateString } from '../lib/dates'

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

type Props = {
  logDates: string[]
  onDayClick: (date: string, hasLog: boolean) => void
}

export function WeekStrip({ logDates, onDayClick }: Props) {
  const today = toLocalDateString()
  const start = startOfWeekSunday(today)
  const set = new Set(logDates)

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    return {
      date,
      label: DOW[i],
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
