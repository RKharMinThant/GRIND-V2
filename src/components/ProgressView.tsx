import { useEffect, useMemo, useState } from 'react'
import { friendlyDateShort, friendlyUpdatedAt } from '../lib/dates'
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
      <div className="page-header">
        <div className="page-title">Progress</div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenAdd()}>
          Add lift
        </button>
      </div>

      <div className="section-header">Last 4 weeks</div>
      <div className="card week-card">
        <div className="week-bars">
          {insights.last4Weeks.map((w) => (
            <div key={w.key} className="week-bar-col">
              <div className="week-bar-count num">{w.count}</div>
              <div className="week-bar-track">
                <div
                  className="week-bar-fill"
                  style={{ height: `${Math.max(6, (w.count / maxWeek) * 100)}%` }}
                />
              </div>
              <div className="week-bar-label t-caption">{weekLabel(w.key, w.label)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="section-header">Training load</div>
      <div className="list-group load-group">
        <LoadRow
          label="Lifting volume"
          tone="strength"
          summary={lifting}
          unit={weightUnit}
        />
        {cardio && <LoadRow label="Cardio zone minutes" tone="activity" summary={cardio} unit="min" />}
      </div>
      <p className="progress-note t-footnote">Last 7 days vs your 4-week average.</p>

      <div className="section-header">Recent PRs</div>
      {prs.length === 0 ? (
        <p className="progress-note progress-note--solo t-footnote">
          PRs show up here when you beat a previous best.
        </p>
      ) : (
        <div className="list-group pr-group">
          {prs.map(({ event, lift }) => (
            <button
              type="button"
              key={`${lift.id}-${event.kind}-${event.recorded_at}`}
              className="list-row pr-row"
              onClick={() => onOpenLift(lift)}
            >
              <span className="icon-badge icon-badge--strength" aria-hidden>
                <TrophyIcon />
              </span>
              <span className="pr-main">
                <span className="pr-name">{event.liftName}</span>
                <span className="pr-kind t-footnote">{PR_LABELS[event.kind]}</span>
              </span>
              <span className="pr-side">
                <span className="pr-value num">
                  {formatValue(event.value)}
                  <span className="unit"> {event.unit}</span>
                </span>
                <span className="pr-date t-footnote">{shortDate(event.recorded_at)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="section-header lifts-header">
        <span>Lifts</span>
        {totalLifts > 0 && (
          <span className="lifts-count">
            {totalLifts} exercise{totalLifts === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {liftsLoading && totalLifts === 0 ? (
        <div className="progress-empty">
          <div className="spinner" />
          <p className="t-subhead">Loading…</p>
        </div>
      ) : byMuscle.length === 0 ? (
        <div className="progress-empty">
          <div className="progress-empty-icon" aria-hidden>
            <DumbbellIcon />
          </div>
          <p className="progress-empty-title t-title3">No lifts yet</p>
          <p className="progress-empty-copy t-subhead">
            Add an exercise with sets, reps, and weight. Group by muscle so you can track progressive
            overload over time.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => onOpenAdd()}>
            Add your first lift
          </button>
        </div>
      ) : (
        byMuscle.map(({ group, lifts }) => (
          <section key={group} className="muscle-group">
            <div className="section-header section-header--group">
              <h3>{group}</h3>
              <button
                type="button"
                className="muscle-group-add"
                aria-label={`Add ${group} exercise`}
                onClick={() => onOpenAdd(group)}
              >
                Add
              </button>
            </div>
            <div className="list-group">
              {lifts.map((lift) => {
                const { status, deltaLabel, arrow } = compareTrackedLift(lift)
                const updated = friendlyUpdatedAt(lift.updated_at)
                const line = getLiftSets(lift).length
                  ? formatSetsDetail(getLiftSets(lift), lift.unit)
                  : formatLiftLine(lift)
                return (
                  <button
                    type="button"
                    key={lift.id}
                    className={`list-row list-row--nav muscle-lift-row status-${status}`}
                    onClick={() => onOpenLift(lift)}
                  >
                    <span className="muscle-lift-main">
                      <span className="muscle-lift-name">{lift.exercise_name}</span>
                      <span className="muscle-lift-nums t-footnote">{line}</span>
                      {updated && <span className="muscle-lift-updated t-caption">Updated {updated}</span>}
                    </span>
                    <span className={`lift-trend status-${status}`}>
                      <span className="lift-trend-arrow" aria-hidden>
                        {arrow}
                      </span>
                      <span className="lift-trend-label num">{deltaLabel}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function LoadRow({
  label,
  tone,
  summary,
  unit,
}: {
  label: string
  tone: 'strength' | 'activity'
  summary: LoadSummary
  unit: string
}) {
  const vs = formatVsAverage(summary.ratio)
  const showStatus = summary.status === 'ramping' || summary.status === 'lighter'
  return (
    <div className={`list-row load-row load-row--${tone}`}>
      <span className={`icon-badge icon-badge--${tone}`} aria-hidden>
        {tone === 'strength' ? <DumbbellIcon /> : <PulseIcon />}
      </span>
      <div className="load-main">
        <span className="load-label">{label}</span>
        <span className="load-vs t-footnote">{vs ? `vs 4-wk avg ${vs}` : 'No 4-wk average yet'}</span>
      </div>
      <div className="load-side">
        <span className="load-value num">
          {Math.round(summary.thisWeek).toLocaleString('en-US')}
          <span className="unit"> {unit}</span>
        </span>
        <span
          className={`chip load-chip load-chip--${summary.status}`}
          title={LOAD_STATUS_TEXT[summary.status]}
        >
          {LOAD_STATUS_CHIP[summary.status]}
        </span>
      </div>
      {showStatus && <span className="load-status-text t-footnote">{LOAD_STATUS_TEXT[summary.status]}</span>}
    </div>
  )
}

function DumbbellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
    </svg>
  )
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
    </svg>
  )
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H4.5a3 3 0 0 0 3 4M16 6h3.5a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" />
    </svg>
  )
}

/** Older weeks come back as MM-DD; show them as "Sep 7". */
function weekLabel(key: string, label: string): string {
  return /^\d\d-\d\d$/.test(label) ? friendlyDateShort(key) : label
}

const PR_LABELS: Record<PrKind, string> = {
  oneRepMax: 'Est. 1RM',
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
