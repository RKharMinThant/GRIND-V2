import { useState } from 'react'
import { greetingForHour, todayHeading, weekSessionCount } from '../lib/dates'
import type { StreakStats } from '../lib/streaks'
import type { Log } from '../types/database'
import { GoalRing } from './GoalRing'
import { Heatmap } from './Heatmap'
import { LogCard } from './LogCard'
import { WeekStrip } from './WeekStrip'

type Props = {
  logs: Log[]
  stats: StreakStats
  photoUrls: Record<string, string>
  displayName: string
  weeklyGoal: number
  onOpenLog: (id: string) => void
  onLogToday: () => void
  onLogDate: (date: string) => void
  onOpenDay: (date: string) => void
  onViewAll: () => void
  /** One-tap rest day for today (or a given date). */
  onRestDay: (date?: string) => Promise<void>
}

export function Dashboard({
  logs,
  stats,
  photoUrls,
  displayName,
  weeklyGoal,
  onOpenLog,
  onLogToday,
  onLogDate,
  onOpenDay,
  onViewAll,
  onRestDay,
}: Props) {
  const [restBusy, setRestBusy] = useState(false)
  const recent = logs.slice(0, 6)
  const logDates = logs.map((l) => l.log_date)
  const weekCount = weekSessionCount(logDates)
  const firstName = displayName.split(' ')[0] || displayName

  async function handleRest(date?: string) {
    if (restBusy) return
    setRestBusy(true)
    try {
      await onRestDay(date)
    } finally {
      setRestBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="home-greeting">
        <div className="eyebrow">{todayHeading()}</div>
        <h1>
          {greetingForHour()}, <em>{firstName}</em>
        </h1>
      </div>

      <div className="hero-panel">
        <div className="hero-streak">
          <div className="label">Current streak</div>
          <div className="num">{stats.current}</div>
          <p>
            {stats.current > 0
              ? `${stats.current} day${stats.current > 1 ? 's' : ''} locked in.`
              : 'Log a session to light the streak.'}
          </p>
        </div>
        <GoalRing current={weekCount} goal={weeklyGoal} />
        <div className="hero-actions">
          <span className={`badge ${stats.hasToday ? 'done' : ''}`}>
            <span className={`dot ${stats.hasToday ? '' : 'pulse'}`} />
            {stats.hasToday ? 'Today logged' : 'Today open'}
          </span>
          <button type="button" className="btn btn-primary" onClick={onLogToday}>
            + Log session
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-rest"
            onClick={() => void handleRest()}
            disabled={restBusy}
          >
            {restBusy ? 'Logging…' : 'Rest day'}
          </button>
        </div>
      </div>

      <WeekStrip
        logDates={logDates}
        onDayClick={(date, hasLog) => {
          if (hasLog) onOpenDay(date)
          else onLogDate(date)
        }}
      />

      <div className="metrics">
        <div className="metric">
          <div className="label">Days</div>
          <span className="num accent">{stats.totalDays}</span>
        </div>
        <div className="metric">
          <div className="label">Best</div>
          <span className="num">{stats.best}</span>
        </div>
        <div className="metric">
          <div className="label">Month</div>
          <span className="num ice">{stats.monthDays}</span>
        </div>
      </div>

      <Heatmap logDates={logDates} />

      <div className="page-header">
        <div className="page-title">Recent</div>
        {logs.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={onViewAll}>
            View all →
          </button>
        )}
      </div>

      {recent.length === 0 ? (
        <div className="empty">
          <div className="empty-mark">G.</div>
          <h3>Start the journal</h3>
          <p>Your first session is the only one that feels hard. Log it and the rest follows.</p>
          <div className="empty-actions">
            <button type="button" className="btn btn-primary" onClick={onLogToday}>
              Log first session
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-rest"
              onClick={() => void handleRest()}
              disabled={restBusy}
            >
              {restBusy ? 'Logging…' : 'Rest day'}
            </button>
          </div>
        </div>
      ) : (
        <div className="logs-grid three-col">
          {recent.map((log, i) => (
            <LogCard
              key={log.id}
              log={log}
              photoUrl={photoUrls[log.id]}
              onOpen={onOpenLog}
              staggerMs={i * 45}
            />
          ))}
        </div>
      )}
    </div>
  )
}
