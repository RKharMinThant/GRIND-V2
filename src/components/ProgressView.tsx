import { friendlyUpdatedAt } from '../lib/dates'
import {
  compareTrackedLift,
  formatLiftLine,
  getLiftSets,
  formatSetsDetail,
} from '../lib/overload'
import { buildProgressInsights } from '../lib/progress'
import type { Log, TrackedLift } from '../types/database'

type Props = {
  logs: Log[]
  weeklyGoal: number
  byMuscle: { group: string; lifts: TrackedLift[] }[]
  liftsLoading?: boolean
  onOpenAdd: (group?: string) => void
  /** Open progress detail (not editor) */
  onOpenLift: (lift: TrackedLift) => void
}

export function ProgressView({
  logs,
  weeklyGoal,
  byMuscle,
  liftsLoading,
  onOpenAdd,
  onOpenLift,
}: Props) {
  const insights = buildProgressInsights(logs, weeklyGoal)
  const maxWeek = Math.max(1, ...insights.last4Weeks.map((w) => w.count), weeklyGoal)
  const totalLifts = byMuscle.reduce((n, g) => n + g.lifts.length, 0)

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
