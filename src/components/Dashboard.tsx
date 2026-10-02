import { useState } from 'react'
import { unlinkedWorkouts } from '../health/logic'
import type { HealthWorkout } from '../health/types'
import type { HealthState } from '../health/useHealth'
import { DEFAULT_DISTANCE_UNIT, DEFAULT_WEEK_START, type DistanceUnit, type WeekStart } from '../lib/units'
import { greetingForHour, toLocalDateString, weekSessionCount } from '../lib/dates'
import type { StreakStats } from '../lib/streaks'
import type { Log } from '../types/database'
import type { GrindAgeState } from '../hooks/useGrindAge'
import { GoalRing } from './GoalRing'
import { GrindAgeCard } from './GrindAgeCard'
import { Heatmap } from './Heatmap'
import { LogCard } from './LogCard'
import { RecoveryCard } from './RecoveryCard'
import { TodayStrip } from './TodayStrip'
import { WeekStrip } from './WeekStrip'
import { WorkoutDetectedCard } from './WorkoutDetectedCard'

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
  health: HealthState
  /** Open the log form with a tracker workout attached */
  onLogWorkout: (workout: HealthWorkout) => void
  stepGoal: number
  onOpenBody: () => void
  grindAge: GrindAgeState
  onOpenGrindAge: () => void
  onOpenSettings: () => void
  weekStart?: WeekStart
  distanceUnit?: DistanceUnit
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
  health,
  onLogWorkout,
  stepGoal,
  onOpenBody,
  grindAge,
  onOpenGrindAge,
  onOpenSettings,
  weekStart = DEFAULT_WEEK_START,
  distanceUnit = DEFAULT_DISTANCE_UNIT,
}: Props) {
  const [restBusy, setRestBusy] = useState(false)
  const recent = logs.slice(0, 6)
  const logDates = logs.map((l) => l.log_date)
  const today = toLocalDateString()
  const weekCount = weekSessionCount(logDates, today, weekStart)
  const firstName = displayName.split(' ')[0] || displayName
  const detected = health.isConnected
    ? unlinkedWorkouts(health.workouts, logs, health.dismissedIds, today)
    : []

  async function handleRest(date?: string) {
    if (restBusy) return
    setRestBusy(true)
    try {
      await onRestDay(date)
    } finally {
      setRestBusy(false)
    }
  }

  const dateEyebrow = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="page home-page">
      <header className="home-greeting">
        <div className="t-subhead home-date">{dateEyebrow}</div>
        <h1 className="page-title">
          {greetingForHour()}, {firstName}
        </h1>
      </header>

      <div className="section-header">
        <h2>This week</h2>
      </div>
      <section className="card home-hero" aria-label="This week">
        <div className="home-hero-top">
          <GoalRing current={weekCount} goal={weeklyGoal} />
          <div className="home-hero-stats">
            <div className="home-stat">
              <span className="label">Week</span>
              <span className="home-stat-value">
                <span className="num">{weekCount}</span>
                <span className="home-stat-unit">of {Math.max(1, weeklyGoal)} sessions</span>
              </span>
            </div>
            <div className="home-stat">
              <span className="label">Streak</span>
              <span className="home-stat-value">
                <span className="num">{stats.current}</span>
                <span className="home-stat-unit">{stats.current === 1 ? 'day' : 'days'}</span>
              </span>
            </div>
            <p className="home-hero-note t-footnote">
              {stats.current > 0
                ? `${stats.current} day${stats.current > 1 ? 's' : ''} locked in.`
                : 'Log a session to light the streak.'}
            </p>
          </div>
        </div>

        <WeekStrip
          weekStart={weekStart}
          logDates={logDates}
          onDayClick={(date, hasLog) => {
            if (hasLog) onOpenDay(date)
            else onLogDate(date)
          }}
        />

        <div className="home-hero-foot">
          <span className={`home-status${stats.hasToday ? ' done' : ''}`}>
            <span className="status-dot" aria-hidden />
            {stats.hasToday ? 'Logged today' : 'Not logged yet'}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void handleRest()}
            disabled={restBusy}
          >
            {restBusy ? 'Logging…' : 'Rest day'}
          </button>
        </div>
      </section>

      {health.isConnected && (
        <TodayStrip
          today={health.today}
          recovery={health.recovery}
          stepGoal={stepGoal}
          distanceUnit={distanceUnit}
          onOpen={onOpenBody}
        />
      )}

      {health.isConnected && (
        <GrindAgeCard grindAge={grindAge} onOpen={onOpenGrindAge} onOpenSettings={onOpenSettings} />
      )}

      {detected[0] && (
        <WorkoutDetectedCard
          workout={detected[0]}
          moreCount={detected.length - 1}
          onLog={onLogWorkout}
          onDismiss={health.dismiss}
        />
      )}

      {health.isConnected && (
        <RecoveryCard
          recovery={health.recovery}
          readiness={health.readiness}
          error={health.error}
          onRetry={() => void health.sync()}
        />
      )}

      <div className="section-header">
        <h2>Totals</h2>
      </div>
      <div className="card metrics">
        <div className="metric">
          <span className="label">Total days</span>
          <span className="num">{stats.totalDays}</span>
        </div>
        <div className="metric">
          <span className="label">Best streak</span>
          <span className="num">{stats.best}</span>
        </div>
        <div className="metric">
          <span className="label">This month</span>
          <span className="num">{stats.monthDays}</span>
        </div>
      </div>

      <Heatmap
        logDates={logDates}
        weekStart={weekStart}
        steps={health.isConnected ? health.steps : undefined}
      />

      <div className="section-header">
        <h2>Recent</h2>
        {logs.length > 0 && (
          <button type="button" onClick={onViewAll}>
            View all ›
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
              className="btn btn-ghost"
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
