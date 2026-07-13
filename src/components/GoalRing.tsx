type Props = {
  current: number
  goal: number
}

export function GoalRing({ current, goal }: Props) {
  const safeGoal = Math.max(1, goal)
  const pct = Math.min(1, current / safeGoal)
  const r = 42
  const c = 2 * Math.PI * r
  const offset = c * (1 - pct)

  return (
    <div className="goal-ring-wrap" aria-label={`${current} of ${safeGoal} sessions this week`}>
      <svg viewBox="0 0 100 100">
        <circle className="track" cx="50" cy="50" r={r} />
        <circle
          className="prog"
          cx="50"
          cy="50"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="goal-ring-center">
        <span className="num">
          {current}/{safeGoal}
        </span>
        <span className="sub">week</span>
      </div>
    </div>
  )
}
