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
}: Props) {
  const raw = Number.isFinite(progress) ? Math.min(2, Math.max(0, progress)) : 0
  const arc = Math.min(1, raw)
  const stroke = Math.round(size * thickness * 10) / 10
  // Shrink the centre label as it gets longer so "12,345" still fits inside the ring
  const labelScale = Math.min(0.32, 1.05 / Math.max(label.length, 1))

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
    <div className="ring" data-tone={tone} style={style} role="img" aria-label={ariaLabel}>
      <div className="ring-track" aria-hidden />
      {raw > 0 && (
        <>
          <div className="ring-arc" aria-hidden />
          <span className="ring-dot ring-dot--start" aria-hidden />
          <span className="ring-dot ring-dot--end" aria-hidden />
        </>
      )}
      <div className="ring-center">
        <span className="ring-label num">{label}</span>
        {sublabel && <span className="ring-sub">{sublabel}</span>}
      </div>
    </div>
  )
}
