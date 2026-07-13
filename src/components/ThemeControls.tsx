import type { ResolvedTheme, ThemePreference } from '../lib/theme'

const LABELS: Record<ThemePreference, string> = {
  system: 'Auto',
  light: 'Light',
  dark: 'Dark',
}

type SegmentProps = {
  preference: ThemePreference
  onChange: (pref: ThemePreference) => void
}

/** Three-way switcher for menus / settings */
export function ThemeSegment({ preference, onChange }: SegmentProps) {
  return (
    <div className="theme-seg" role="group" aria-label="Color theme">
      {(['system', 'light', 'dark'] as ThemePreference[]).map((pref) => (
        <button
          key={pref}
          type="button"
          className={preference === pref ? 'active' : ''}
          onClick={() => onChange(pref)}
          aria-pressed={preference === pref}
        >
          {LABELS[pref]}
        </button>
      ))}
    </div>
  )
}

type IconProps = {
  resolved: ResolvedTheme
  /** Still accepted for callers; icon only flips light ↔ dark */
  preference?: ThemePreference
  onCycle: () => void
}

/** One-click light ↔ dark (Auto only lives in settings). */
export function ThemeIconButton({ resolved, onCycle }: IconProps) {
  const title =
    resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button type="button" className="theme-icon-btn" onClick={onCycle} title={title} aria-label={title}>
      {resolved === 'dark' ? (
        /* Sun: currently dark → click for light */
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        /* Moon: currently light → click for dark */
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z" />
        </svg>
      )}
    </button>
  )
}
