import { Link } from 'react-router-dom'
import { ThemeIconButton } from '../components/ThemeControls'
import type { ResolvedTheme, ThemePreference } from '../lib/theme'
import { useScrollProgress } from './useScrollProgress'

type Props = {
  resolved: ResolvedTheme
  preference: ThemePreference
  onThemeCycle: () => void
}

export function MarketingNav({ resolved, preference, onThemeCycle }: Props) {
  const progress = useScrollProgress()

  return (
    <header className="mkt-nav">
      <div
        className="mkt-scroll-progress"
        style={{ transform: `scaleX(${progress})` }}
        aria-hidden
      />
      <div className="mkt-nav-inner">
        <a href="#top" className="mkt-logo">
          GRIND<span>.</span>
        </a>
        <nav className="mkt-nav-links" aria-label="Marketing">
          <a href="#features">Features</a>
          <a href="#progress">Progress</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <div className="mkt-nav-actions">
          <ThemeIconButton
            resolved={resolved}
            preference={preference}
            onCycle={onThemeCycle}
          />
          <Link to="/app" className="mkt-btn mkt-btn--ghost">
            Open app
          </Link>
          <Link to="/app" className="mkt-btn mkt-btn--primary mkt-nav-cta">
            Start free
          </Link>
        </div>
      </div>
    </header>
  )
}
