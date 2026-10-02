import { useCountUp } from '../hooks/useCountUp'
import { formatFixed } from '../lib/motion'

type Props = {
  value: number
  decimals?: number
  /** Overrides the default fixed-decimal toLocaleString format. */
  format?: (n: number) => string
  className?: string
}

/** A number that counts up on first mount. Screen readers get the final value only. */
export function CountUp({ value, decimals = 0, format, className }: Props) {
  const fmt = format ?? ((n: number) => formatFixed(n, decimals))
  const animated = useCountUp(value, { decimals })
  return (
    <span className={className}>
      <span aria-hidden>{fmt(animated)}</span>
      <span className="sr-only">{fmt(value)}</span>
    </span>
  )
}
