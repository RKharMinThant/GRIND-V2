import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { easeOut, prefersReducedMotion } from '../../lib/motion'
import { CountUp } from '../CountUp'
import type { RingTone } from './tones'

type Band = { from: number; to: number; tone: RingTone }
type Props = {
  value: number
  min: number
  max: number
  /** Sweep in degrees, centred at the top. 240 default; 180 = semicircle */
  sweep?: number
  /** px width */
  size?: number
  /** Stroke px, default size * 0.07 */
  thickness?: number
  /** Fill + glow colour */
  tone?: RingTone
  /** Faint coloured track segments under the fill (e.g. younger = accent, older = danger) */
  bands?: Band[]
  /** A tick across the track with a small label outside the arc */
  marker?: { value: number; label: string }
  /** Where the coloured fill starts; default min */
  fillFrom?: number
  /** Big centre text, in the display face */
  label: string
  sublabel?: string
  eyebrow?: string
  /** Small captions at the two arc ends */
  endLabels?: [string, string]
  ariaLabel: string
  /** Animate the label number when it is numeric */
  countUp?: boolean
  decimals?: number
  /** Element for the root and centre block; 'span' when the gauge sits inside a button */
  as?: 'div' | 'span'
}

// Same colours the stylesheet maps data-tone to; bands need them per segment
const TONE_VAR: Record<RingTone, string> = {
  accent: '--ring-accent',
  heart: '--c-heart',
  sleep: '--c-sleep',
  strength: '--c-strength',
  activity: '--c-activity',
  warn: '--warn',
  danger: '--danger',
}

const RAD = Math.PI / 180
const MOUNT_MS = 900
const UPDATE_MS = 300

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const finite = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback)
const r1 = (n: number) => Math.round(n * 10) / 10

/** Angles are degrees clockwise from 12 o'clock. */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  return [cx + r * Math.sin(deg * RAD), cy - r * Math.cos(deg * RAD)]
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x0, y0] = polar(cx, cy, r, from)
  const [x1, y1] = polar(cx, cy, r, to)
  const delta = to - from
  return `M${r1(x0)} ${r1(y0)}A${r} ${r} 0 ${Math.abs(delta) > 180 ? 1 : 0} ${delta >= 0 ? 1 : 0} ${r1(x1)} ${r1(y1)}`
}

/** Open-ended dial: a fill from `fillFrom` to `value` over a banded track, with a knob and optional marker. */
export function ArcGauge({
  value,
  min,
  max,
  sweep = 240,
  size = 260,
  thickness,
  tone = 'accent',
  bands,
  marker,
  fillFrom,
  label,
  sublabel,
  eyebrow,
  endLabels,
  ariaLabel,
  countUp = false,
  decimals,
  as: Tag = 'div',
}: Props) {
  const uid = useId().replace(/:/g, '')
  const gradId = `ag-grad-${uid}`
  const glowId = `ag-glow-${uid}`
  const knobGlowId = `ag-kglow-${uid}`

  const lo = finite(Math.min(min, max), 0)
  const hi = finite(Math.max(min, max), lo + 1)
  const span = hi - lo || 1
  const target = clamp(finite(value, lo), lo, hi)
  const from = clamp(finite(fillFrom ?? lo, lo), lo, hi)

  // Fill head, tweened by JS: 900ms from fillFrom on mount, 300ms on later changes.
  // Redrawing the path (rather than only a dash offset) is what lets a changed value animate too.
  const [reduced] = useState(prefersReducedMotion)
  const [shown, setShown] = useState(from)
  const shownRef = useRef(shown)
  const firstRun = useRef(true)
  useEffect(() => {
    if (reduced) return
    const startVal = shownRef.current
    const dur = firstRun.current ? MOUNT_MS : UPDATE_MS
    let raf = 0
    let t0 = 0
    const tick = (now: number) => {
      firstRun.current = false
      if (!t0) t0 = now
      const t = Math.min(1, (now - t0) / dur)
      shownRef.current = startVal + (target - startVal) * easeOut(t)
      setShown(shownRef.current)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, reduced])
  const head = reduced ? target : shown

  // Geometry
  const sw = clamp(finite(sweep, 240), 60, 340)
  const half = sw / 2
  const t = thickness ?? size * 0.07
  const knobR = t * 0.55
  const pad = Math.max(t / 2, knobR + 1.5) + 4
  const markerRoom = marker ? 20 : 0 // top room for the marker caption
  const r = (size - 2 * pad) / 2
  const cx = size / 2
  const cy = pad + markerRoom + r
  // Lowest point of the arc (its ends, or the bottom of the circle past 180 degrees)
  const lowest = cy - r * Math.cos(half * RAD)
  const endRoom = endLabels ? 18 : 0
  const height = Math.ceil(lowest + pad + endRoom)

  const angleOf = (v: number) => -half + (sw * (clamp(v, lo, hi) - lo)) / span
  const a0 = angleOf(from)
  const aHead = angleOf(head)
  const fillVisible = Math.abs(aHead - a0) > 0.05
  const [gx0, gy0] = polar(cx, cy, r, a0)
  const [gx1, gy1] = polar(cx, cy, r, aHead)
  const [kx, ky] = polar(cx, cy, r, aHead)

  // Marker tick and caption
  let markerEl: ReactNode = null
  if (marker) {
    const am = angleOf(finite(marker.value, lo))
    const [tx0, ty0] = polar(cx, cy, r - t / 2 - 3, am)
    const [tx1, ty1] = polar(cx, cy, r + t / 2 + 3, am)
    const [lx, ly] = polar(cx, cy, r + t / 2 + 10, am)
    const s = Math.sin(am * RAD)
    const anchor = s > 0.35 ? 'start' : s < -0.35 ? 'end' : 'middle'
    // Keep the caption inside the box (about 6.5px per character at 11px)
    const w = marker.label.length * 6.5
    const lxc =
      anchor === 'start'
        ? Math.min(lx, size - 2 - w)
        : anchor === 'end'
          ? Math.max(lx, 2 + w)
          : clamp(lx, 2 + w / 2, size - 2 - w / 2)
    markerEl = (
      <>
        <line
          className="arc-gauge__tick"
          x1={tx0}
          y1={ty0}
          x2={tx1}
          y2={ty1}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <text
          className="arc-gauge__marker-label"
          x={lxc}
          y={ly}
          textAnchor={anchor}
          dominantBaseline="central"
        >
          {marker.label}
        </text>
      </>
    )
  }

  // Centre label: a full dial centres it; a semicircle sits it on the baseline
  const semicircle = sw <= 200
  const labelSize = size * (semicircle ? 0.2 : 0.3)
  const numeric = /^[+-]?\d+(\.\d+)?$/.test(label.trim())
  const labelDecimals = decimals ?? label.split('.')[1]?.length ?? 0
  const plus = label.trim().startsWith('+')

  const rootStyle = {
    width: size,
    height,
    '--gauge-label-size': `${labelSize}px`,
    '--gauge-size': `${size}px`,
    '--gauge-thickness': `${t}px`,
  } as CSSProperties
  const centerStyle: CSSProperties = { top: semicircle ? cy - 2 : cy }

  return (
    <Tag className="arc-gauge" data-tone={tone} style={rootStyle} role="img" aria-label={ariaLabel}>
      <svg
        className="arc-gauge__svg"
        viewBox={`0 0 ${size} ${height}`}
        aria-hidden
        focusable="false"
        fill="none"
        strokeLinecap="round"
      >
        <defs>
          <linearGradient
            id={gradId}
            gradientUnits="userSpaceOnUse"
            x1={gx0}
            y1={gy0}
            x2={fillVisible ? gx1 : gx0 + 1}
            y2={fillVisible ? gy1 : gy0}
          >
            <stop className="arc-gauge__stop-a" offset="0" />
            <stop className="arc-gauge__stop-b" offset="1" />
          </linearGradient>
          <filter id={glowId} filterUnits="userSpaceOnUse" x={-pad * 2} y={-pad * 2} width={size + pad * 4} height={height + pad * 4}>
            <feGaussianBlur stdDeviation={t * 0.9} />
          </filter>
          <filter id={knobGlowId} filterUnits="userSpaceOnUse" x={-pad * 2} y={-pad * 2} width={size + pad * 4} height={height + pad * 4}>
            <feGaussianBlur stdDeviation={t * 0.45} />
          </filter>
        </defs>

        <path className="arc-gauge__track" d={arcPath(cx, cy, r, -half, half)} strokeWidth={t} />

        {bands?.map((b, i) => {
          if (!Number.isFinite(b.from) || !Number.isFinite(b.to)) return null
          const b0 = angleOf(Math.min(b.from, b.to))
          const b1 = angleOf(Math.max(b.from, b.to))
          if (b1 - b0 < 0.05) return null
          return (
            <path
              key={i}
              d={arcPath(cx, cy, r, b0, b1)}
              strokeWidth={t}
              strokeLinecap="butt"
              style={{ stroke: `color-mix(in srgb, var(${TONE_VAR[b.tone]}) 22%, transparent)` }}
            />
          )
        })}

        {fillVisible && (
          <>
            <path
              className="arc-gauge__glow"
              d={arcPath(cx, cy, r, a0, aHead)}
              strokeWidth={t}
              filter={`url(#${glowId})`}
            />
            <path d={arcPath(cx, cy, r, a0, aHead)} strokeWidth={t} stroke={`url(#${gradId})`} />
          </>
        )}

        {markerEl}

        <circle className="arc-gauge__knob-glow" cx={kx} cy={ky} r={knobR} filter={`url(#${knobGlowId})`} />
        <circle className="arc-gauge__knob" cx={kx} cy={ky} r={knobR} />

        {endLabels && (
          <>
            <text
              className="arc-gauge__end-label"
              x={Math.max(2, polar(cx, cy, r, -half)[0] - t / 2)}
              y={lowest + t / 2 + 12}
              textAnchor="start"
            >
              {endLabels[0]}
            </text>
            <text
              className="arc-gauge__end-label"
              x={Math.min(size - 2, polar(cx, cy, r, half)[0] + t / 2)}
              y={lowest + t / 2 + 12}
              textAnchor="end"
            >
              {endLabels[1]}
            </text>
          </>
        )}
      </svg>

      <Tag
        className={`arc-gauge__center ${semicircle ? 'arc-gauge__center--base' : 'arc-gauge__center--mid'}`}
        style={centerStyle}
      >
        {eyebrow && <span className="t-eyebrow">{eyebrow}</span>}
        <span className="t-display arc-gauge__label">
          {countUp && numeric ? (
            <CountUp
              value={Number(label)}
              decimals={labelDecimals}
              format={
                plus ? (n) => `${n > 0 ? '+' : ''}${n.toFixed(labelDecimals)}` : undefined
              }
            />
          ) : (
            label
          )}
        </span>
        {sublabel && <span className="t-subhead arc-gauge__sub">{sublabel}</span>}
      </Tag>
    </Tag>
  )
}
