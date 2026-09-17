import { toneClass, type Tone } from './tones'

type Props = {
  values: (number | null)[]
  tone?: Tone
  height?: number
  ariaLabel: string
}

/** Minimal trend line; gaps where values are null. Last point is marked. */
export function Sparkline({ values, tone = 'accent', height = 36, ariaLabel }: Props) {
  const nums = values.filter((v): v is number => v != null)
  if (nums.length < 2) return <div className="sparkline sparkline--empty" style={{ height }} aria-hidden />
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const w = 100
  const x = (i: number) => (values.length === 1 ? w : (i / (values.length - 1)) * w)
  const y = (v: number) => 90 - ((v - min) / span) * 80

  const segments: string[] = []
  let current = ''
  values.forEach((v, i) => {
    if (v == null) {
      if (current) segments.push(current)
      current = ''
      return
    }
    current += `${current ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`
  })
  if (current) segments.push(current)

  const lastIndex = values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop() ?? 0
  const last = values[lastIndex] as number

  return (
    <div className={`sparkline ${toneClass(tone)}`} style={{ height }} role="img" aria-label={ariaLabel}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {segments.map((d, i) => (
          <path key={i} d={d} className="sparkline-line" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <span className="sparkline-dot" style={{ left: `${x(lastIndex)}%`, top: `${y(last)}%` }} />
    </div>
  )
}
