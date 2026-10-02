import { useId } from 'react'
import { useElementWidth } from '../../hooks/useElementWidth'
import { friendlyDateShort } from '../../lib/dates'
import type { RingTone } from './tones'

type Props = {
  /** Weekly readings, oldest first */
  points: { weekStart: string; grindAge: number }[]
  /** Real age: drawn as a dashed reference line */
  chronologicalAge: number
  tone: RingTone
  ariaLabel: string
}

const HEIGHT = 176
const PAD = { left: 4, right: 12, top: 24, bottom: 28 }
const DOMAIN_PAD = 0.5

const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * Weekly GRIND Age as a line over a real-age reference. Sized from its container in
 * pixels (not a scaled viewBox) so text and strokes stay crisp at every width.
 */
export function AgeTrend(props: Props) {
  if (props.points.length < 2) {
    return <p className="t-subhead age-trend__empty">Your trend appears after your second weekly reading.</p>
  }
  return <TrendChart {...props} />
}

// Split from AgeTrend so the width observer mounts with the chart, not with the empty state
function TrendChart({ points, chronologicalAge, tone, ariaLabel }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const uid = useId().replace(/:/g, '')
  const areaId = `at-area-${uid}`
  const glowId = `at-glow-${uid}`

  const values = points.map((p) => p.grindAge)
  const lo = Math.min(...values, chronologicalAge) - DOMAIN_PAD
  const hi = Math.max(...values, chronologicalAge) + DOMAIN_PAD
  const plotW = Math.max(1, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (plotW * i) / (points.length - 1)
  // Older plots higher: the line climbing means ageing
  const y = (v: number) => PAD.top + plotH * (1 - (v - lo) / (hi - lo))

  const coords = points.map((p, i) => [x(i), y(p.grindAge)] as const)
  const line = coords.map(([cx, cy], i) => `${i ? 'L' : 'M'}${r1(cx)} ${r1(cy)}`).join('')
  const baseY = PAD.top + plotH
  const [lx, ly] = coords[coords.length - 1]
  const area = `${line}L${r1(lx)} ${baseY}L${r1(coords[0][0])} ${baseY}Z`
  const refY = y(chronologicalAge)

  // Put the value on the side the line is not coming from, so it never sits on the stroke
  const cameFromAbove = coords.length > 1 && coords[coords.length - 2][1] < ly
  const valueY = cameFromAbove ? ly + 22 : ly - 13

  return (
    <div ref={ref} className="age-trend t-tone" data-tone={tone}>
      {width > 0 && (
        <svg
          className="age-trend__svg"
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={ariaLabel}
          focusable="false"
          fill="none"
        >
          <defs>
            <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
              <stop className="age-trend__stop-a" offset="0" />
              <stop className="age-trend__stop-b" offset="1" />
            </linearGradient>
            <filter id={glowId} filterUnits="userSpaceOnUse" x={lx - 24} y={ly - 24} width={48} height={48}>
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          <line className="age-trend__ref" x1={PAD.left} x2={width - PAD.right} y1={refY} y2={refY} />
          <text className="age-trend__ref-label" x={PAD.left} y={refY - 6}>
            Real age
          </text>

          <path className="age-trend__area" d={area} fill={`url(#${areaId})`} />
          <path className="age-trend__line" d={line} pathLength={1} />

          <circle className="age-trend__dot-glow" cx={lx} cy={ly} r={5} filter={`url(#${glowId})`} />
          <circle className="age-trend__dot" cx={lx} cy={ly} r={5} />
          <text className="t-display age-trend__value" x={lx + 4} y={valueY} textAnchor="end">
            {values[values.length - 1].toFixed(1)}
          </text>

          <text className="age-trend__x" x={PAD.left} y={HEIGHT - 6} textAnchor="start">
            {friendlyDateShort(points[0].weekStart)}
          </text>
          <text className="age-trend__x" x={width - PAD.right} y={HEIGHT - 6} textAnchor="end">
            {friendlyDateShort(points[points.length - 1].weekStart)}
          </text>
        </svg>
      )}
    </div>
  )
}
