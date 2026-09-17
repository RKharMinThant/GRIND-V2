import { useMemo, useState, type PointerEvent } from 'react'

type Point = { minute: number; bpm: number }

type Props = {
  points: Point[]
  ariaLabel: string
}

const fmtMinute = (m: number) =>
  new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** Heart rate across the day (5-minute buckets). Drag or tap to inspect. */
export function DayCurve({ points, ariaLabel }: Props) {
  const [hover, setHover] = useState<Point | null>(null)
  const { line, area, min, max } = useMemo(() => {
    if (points.length < 2) return { line: '', area: '', min: 0, max: 0 }
    const lo = Math.min(...points.map((p) => p.bpm))
    const hi = Math.max(...points.map((p) => p.bpm))
    const span = hi - lo || 1
    const X = (m: number) => (m / 1440) * 100
    const Y = (b: number) => 95 - ((b - lo) / span) * 85
    let d = ''
    let prev = -Infinity
    for (const p of points) {
      // Break the line across gaps longer than 30 minutes (tracker off-wrist)
      d += `${p.minute - prev > 30 ? 'M' : 'L'}${X(p.minute).toFixed(2)},${Y(p.bpm).toFixed(2)}`
      prev = p.minute
    }
    const first = points[0]
    const lastP = points[points.length - 1]
    const fill = `M${X(first.minute)},100 ` + points.map((p) => `L${X(p.minute).toFixed(2)},${Y(p.bpm).toFixed(2)}`).join('') + ` L${X(lastP.minute)},100 Z`
    return { line: d, area: fill, min: lo, max: hi }
  }, [points])

  if (points.length < 2) return <p className="chart-empty">No heart-rate data yet today.</p>

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const minute = ((e.clientX - rect.left) / rect.width) * 1440
    let best = points[0]
    for (const p of points) if (Math.abs(p.minute - minute) < Math.abs(best.minute - minute)) best = p
    setHover(best)
  }

  const shown = hover ?? points[points.length - 1]

  return (
    <div className="day-curve">
      <div className="chart-readout" aria-live="polite">
        <span className="chart-readout-value">
          {shown.bpm}
          <small> bpm</small>
        </span>
        <span className="chart-readout-meta">
          {hover ? fmtMinute(shown.minute) : 'Latest'} · range {min}–{max}
        </span>
      </div>
      <div
        className="day-curve-plot"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path d={area} className="day-curve-area" />
          <path d={line} className="day-curve-line" vectorEffect="non-scaling-stroke" />
        </svg>
        {hover && <span className="day-curve-cursor" style={{ left: `${(hover.minute / 1440) * 100}%` }} />}
      </div>
      <div className="day-curve-axis" aria-hidden>
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>12a</span>
      </div>
    </div>
  )
}
