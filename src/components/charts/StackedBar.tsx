import { toneClass, type Tone } from './tones'

type Part = { label: string; value: number; tone: Tone }

type Props = {
  parts: Part[]
  unit?: string
  ariaLabel: string
}

/** One horizontal bar split into parts, with a value legend. */
export function StackedBar({ parts, unit = 'min', ariaLabel }: Props) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0)
  return (
    <div className="stacked-bar">
      <div className="stacked-bar-track" role="img" aria-label={ariaLabel}>
        {total > 0 &&
          parts.map((p) =>
            p.value > 0 ? (
              <span key={p.label} className={`stacked-bar-part ${toneClass(p.tone)}`} style={{ flexGrow: p.value }} />
            ) : null,
          )}
      </div>
      <div className="stacked-bar-legend">
        {parts.map((p) => (
          <span key={p.label} className={toneClass(p.tone)}>
            <i aria-hidden />
            {p.label} <b>{p.value}</b>
            {unit ? ` ${unit}` : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
