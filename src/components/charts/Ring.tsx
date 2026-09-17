type Props = {
  /** 0..1 */
  progress: number
  size?: number
  label: string
  sublabel?: string
  ariaLabel: string
}

/** Progress ring with a centered number (steps ring on Home). */
export function Ring({ progress, size = 96, label, sublabel, ariaLabel }: Props) {
  const r = 42
  const c = 2 * Math.PI * r
  const p = Math.min(1, Math.max(0, progress))
  return (
    <div className="chart-ring" style={{ width: size, height: size }} role="img" aria-label={ariaLabel}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle className="chart-ring-track" cx="50" cy="50" r={r} />
        <circle
          className={`chart-ring-prog${p >= 1 ? ' done' : ''}`}
          cx="50"
          cy="50"
          r={r}
          strokeDasharray={c}
          style={{ ['--ring-offset' as string]: `${c * (1 - p)}`, ['--ring-full' as string]: `${c}` }}
        />
      </svg>
      <div className="chart-ring-center">
        <span className="chart-ring-label">{label}</span>
        {sublabel && <span className="chart-ring-sub">{sublabel}</span>}
      </div>
    </div>
  )
}
