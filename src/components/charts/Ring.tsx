import type { CSSProperties } from 'react'
import type { RingTone } from './tones'

type Props = {
  /** 0..1 fills the ring; above 1 the head overlaps the tail (Apple-style), up to 2 laps */
  progress: number
  size?: number
  label: string
  sublabel?: string
  ariaLabel: string
  /** Metric colour. Defaults to the brand accent. */
  tone?: RingTone
  /** Stroke width as a fraction of the diameter (Apple rings sit around 12–14%) */
  thickness?: number
  /** Blurred copy of the arc behind it, for hero moments */
  glow?: boolean
  /** Centre label in the condensed display face (Bebas), at a larger scale */
  display?: boolean
}

/** Progress ring with a centered number — styled like Apple's Activity rings. */
export function Ring({
  progress,
  size = 96,
  label,
  sublabel,
  ariaLabel,
  tone,
  thickness = 0.13,
  glow = false,
  display = false,
}: Props) {
  const raw = Number.isFinite(progress) ? Math.min(2, Math.max(0, progress)) : 0
  const arc = Math.min(1, raw)
  const stroke = Math.round(size * thickness * 10) / 10
  // Shrink the centre label as it gets longer so "12,345" still fits inside the ring
  // Bebas is condensed, so the display face gets ~1.35x the room
  const labelScale = Math.min(0.32, 1.05 / Math.max(label.length, 1)) * (display ? 1.35 : 1)

  const style = {
    width: size,
    height: size,
    '--ring-size': `${size}px`,
    '--ring-w': `${stroke}px`,
    '--ring-p': arc,
    '--ring-end': raw,
    '--ring-label-scale': labelScale,
  } as CSSProperties

  return (
    <div className={glow ? 'ring ring--glow' : 'ring'} data-tone={tone} style={style} role="img" aria-label={ariaLabel}>
      <div className="ring-track" aria-hidden />
      {raw > 0 && (
        <>
          {glow && (
            // Blur lives on this wrapper: a filter on the masked arc itself would be clipped by its mask
            <div className="ring-glow" aria-hidden>
              <div className="ring-arc" />
              <span className="ring-dot ring-dot--start" />
              <span className="ring-dot ring-dot--end" />
            </div>
          )}
          <div className="ring-arc" aria-hidden />
          <span className="ring-dot ring-dot--start" aria-hidden />
          <span className="ring-dot ring-dot--end" aria-hidden />
        </>
      )}
      <div className="ring-center">
        <span className={display ? 'ring-label t-display' : 'ring-label num'}>{label}</span>
        {sublabel && <span className="ring-sub">{sublabel}</span>}
      </div>
    </div>
  )
}
