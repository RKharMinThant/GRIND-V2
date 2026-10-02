import { Ring } from './charts/Ring'

type Props = {
  current: number
  goal: number
}

/** Weekly session goal on Home — a glowing accent dial. */
export function GoalRing({ current, goal }: Props) {
  const safeGoal = Math.max(1, goal)

  return (
    <div className="goal-ring-wrap">
      <Ring
        size={120}
        tone="accent"
        glow
        display
        progress={current / safeGoal}
        label={`${current}/${safeGoal}`}
        sublabel="week"
        ariaLabel={`${current} of ${safeGoal} sessions this week`}
      />
    </div>
  )
}
