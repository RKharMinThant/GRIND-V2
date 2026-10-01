import { useEffect, useMemo, useState } from 'react'
import { friendlyUpdatedAt } from '../lib/dates'
import {
  compareTrackedLift,
  formatLiftLine,
  getLiftSets,
  formatSetsDetail,
  type LiftHistoryPoint,
} from '../lib/overload'
import { prEvents, recentPrs, type PrKind, type WeightUnit } from '../lib/strength'
import {
  LOAD_STATUS_CHIP,
  LOAD_STATUS_TEXT,
  formatVsAverage,
  liftingVolumeByDay,
  loadSummary,
  zoneMinutesByDay,
  type LoadSummary,
} from '../lib/trainingLoad'
import { toLocalDateString } from '../lib/dates'
import { useBodySection } from '../health/useBodySection'
import type { HealthState } from '../health/useHealth'
import { DEFAULT_WEEK_START, type WeekStart } from '../lib/units'
import { buildProgressInsights } from '../lib/progress'
import type { Log, TrackedLift } from '../types/database'

type Props = {
  logs: Log[]
  weeklyGoal: number
  weekStart?: WeekStart
  byMuscle: { group: string; lifts: TrackedLift[] }[]
  liftsLoading?: boolean
  onOpenAdd: (group?: string) => void
  fetchAllHistory: () => Promise<LiftHistoryPoint[]>
  /** Open progress detail (not editor) */
  onOpenLift: (lift: TrackedLift) => void
  health: HealthState
  weightUnit: WeightUnit
}

export function ProgressView({
  logs,
  weeklyGoal,
  byMuscle,
  liftsLoading,
  onOpenAdd,
  fetchAllHistory,
  onOpenLift,
  weekStart = DEFAULT_WEEK_START,
  health,
  weightUnit,
}: Props) {
  const insights = buildProgressInsights(logs, weeklyGoal, weekStart)
  const maxWeek = Math.max(1, ...insights.last4Weeks.map((w) => w.count), weeklyGoal)
  const totalLifts = byMuscle.reduce((n, g) => n + g.lifts.length, 0)

  const [allHistory, setAllHistory] = useState<LiftHistoryPoint[]>([])
  // Refetch only when a lift is added, removed or saved, not on every list identity change
  const historyKey = useMemo(
    () =>
      byMuscle
        .flatMap(({ lifts }) => lifts.map((l) => `${l.id}:${l.updated_at}`))
        .join('|'),
    [byMuscle],
  )
  useEffect(() => {
    if (!historyKey && liftsLoading) return
    let cancelled = false
    void fetchAllHistory().then((rows) => {
      if (!cancelled) setAllHistory(rows)
    })
    return () => {
      cancelled = true
    }
  }, [fetchAllHistory, historyKey, liftsLoading])

  const prs = useMemo(() => {
    const events = byMuscle.flatMap(({ lifts }) =>
      lifts.flatMap((lift) =>
        prEvents(
          lift.exercise_name,
          allHistory.filter((p) => p.lift_id === lift.id),
          lift.unit,
        ).map((event) => ({ event, lift })),
      ),
    )
    const byEvent = new Map(events.map((e) => [e.event, e.lift]))
    return recentPrs(events.map((e) => e.event)).map((event) => ({
      event,
      lift: byEvent.get(event)!,
    }))
  }, [allHistory, byMuscle])

  const today = toLocalDateString()
  const lifting = useMemo(
    () => loadSummary(liftingVolumeByDay(allHistory, weightUnit), today),
    [allHistory, weightUnit, today],
  )
  const activity = useBodySection(health, 'activity').data
  // The activity section covers 30 days, so the cardio baseline is days 7–29 back
  const cardio = useMemo(
    () => (health.isConnected && activity ? loadSummary(zoneMinutesByDay(activity), today, 23) : null),
    [health.isConnected, activity, today],
  )

  return (
    <div className="page progress-page">
      <div className="page-header page-header--row">
        <div>
          <div className="page-title">Progress</div>
          <p className="progress-sub">Working sets by muscle group.</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenAdd()}>
          Add lift
        </button>
      </div>

      <section className="progress-block">
        <div className="section-title-row">
          <h2 className="section-heading">Last 4 weeks</h2>
        </div>
        <div className="week-bars">
          {insights.last4Weeks.map((w) => (
            <div key={w.key} className="week-bar-col">
              <div className="week-bar-track">
                <div
                  className="week-bar-fill"
                  style={{ height: `${Math.max(8, (w.count / maxWeek) * 100)}%` }}
                />
              </div>
              <div className="week-bar-count">{w.count}</div>
              <div className="week-bar-label">{w.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="progress-block">
        <div className="section-title-row">
          <h2 className="section-heading">Training load</h2>
        </div>
        <div className="load-rows">
          <LoadRow label="Lifting volume" summary={lifting} unit={weightUnit} />
          {cardio && <LoadRow label="Cardio (zone minutes)" summary={cardio} unit="min" />}
        </div>
        <p className="field-hint load-note">Last 7 days vs your 4-week average.</p>
      </section>

      <section className="progress-block">
        <div className="section-title-row">
          <h2 className="section-heading">Recent PRs</h2>
        </div>
        {prs.length === 0 ? (
          <p className="field-hint">PRs show up here when you beat a previous best.</p>
        ) : (
          <ul className="strength-pr-list">
            {prs.map(({ event, lift }) => (
              <li key={`${lift.id}-${event.kind}-${event.recorded_at}`}>
                <button type="button" className="strength-pr-row" onClick={() => onOpenLift(lift)}>
                  <span className={`strength-pr-kind strength-pr-kind--${event.kind}`}>
                    {PR_LABELS[event.kind]}
                  </span>
                  <span className="strength-pr-name">{event.liftName}</span>
                  <span className="strength-pr-value">
                    {formatValue(event.value)} {event.unit}
                  </span>
                  <span className="strength-pr-date">{shortDate(event.recorded_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="progress-block">
        <div className="section-title-row">
          <h2 className="section-heading">Lifts</h2>
          {totalLifts > 0 && (
            <span className="section-meta">
              {totalLifts} exercise{totalLifts === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {liftsLoading && totalLifts === 0 ? (
          <div className="progress-empty">
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            Loading…
          </div>
        ) : byMuscle.length === 0 ? (
          <div className="progress-empty progress-empty--lifts">
            <div className="progress-empty-icon" aria-hidden>
              ◎
            </div>
            <p className="progress-empty-title">No lifts yet</p>
            <p className="progress-empty-copy">
              Add an exercise with sets, reps, and weight. Group by muscle so you can track progressive
              overload over time.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => onOpenAdd()}>
              Add your first lift
            </button>
          </div>
        ) : (
          <div className="muscle-groups">
            {byMuscle.map(({ group, lifts }) => (
              <section key={group} className="muscle-group">
                <header className="muscle-group-head">
                  <h3 className="muscle-group-title">{group}</h3>
                  <span className="muscle-group-count">{lifts.length}</span>
                  <button
                    type="button"
                    className="muscle-group-add"
                    aria-label={`Add ${group} exercise`}
                    onClick={() => onOpenAdd(group)}
                  >
                    <span aria-hidden>+</span>
                  </button>
                </header>
                <ul className="muscle-lift-list">
                  {lifts.map((lift) => {
                    const { status, deltaLabel, arrow } = compareTrackedLift(lift)
                    const updated = friendlyUpdatedAt(lift.updated_at)
                    const line = getLiftSets(lift).length
                      ? formatSetsDetail(getLiftSets(lift), lift.unit)
                      : formatLiftLine(lift)
                    return (
                      <li key={lift.id} className="muscle-lift-item">
                        <button
                          type="button"
                          className={`muscle-lift-row status-${status}`}
                          onClick={() => onOpenLift(lift)}
                        >
                          <div className="muscle-lift-main">
                            <span className="muscle-lift-name">{lift.exercise_name}</span>
                            <span className={`muscle-lift-nums status-${status}`}>
                              <span className="muscle-lift-arrow" aria-hidden>
                                {arrow}
                              </span>
                              {line}
                            </span>
                            {updated && (
                              <span className="muscle-lift-updated">Last updated: {updated}</span>
                            )}
                          </div>
                          <span className={`lift-status-badge status-${status}`}>
                            {deltaLabel}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function LoadRow({ label, summary, unit }: { label: string; summary: LoadSummary; unit: string }) {
  const vs = formatVsAverage(summary.ratio)
  return (
    <div className="load-row">
      <div className="load-main">
        <span className="load-label">{label}</span>
        <span className="load-value">
          {Math.round(summary.thisWeek).toLocaleString('en-US')} {unit}
        </span>
        <span className="load-vs">{vs ? `vs 4-wk avg ${vs}` : 'No 4-wk average yet'}</span>
      </div>
      <span
        className={`load-chip load-chip--${summary.status}`}
        title={LOAD_STATUS_TEXT[summary.status]}
      >
        {LOAD_STATUS_CHIP[summary.status]}
      </span>
      {(summary.status === 'ramping' || summary.status === 'lighter') && (
        <span className="load-status-text">{LOAD_STATUS_TEXT[summary.status]}</span>
      )}
    </div>
  )
}

const PR_LABELS: Record<PrKind, string> = {
  oneRepMax: '1RM est.',
  heaviest: 'Heaviest',
  volume: 'Volume',
}

function formatValue(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(1)
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
