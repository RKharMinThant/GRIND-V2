import { Link } from 'react-router-dom'
import { BRAND_LINES, BRAND_PITCH } from '../lib/brand'
import { useTheme } from '../hooks/useTheme'
import { MarketingNav } from './MarketingNav'
import { PhoneHomeFrame, PhoneProgressFrame } from './ProductFrames'
import { Reveal } from './Reveal'
import './marketing.css'

const PROOF = ['Streaks', 'Lifts', 'Proof', 'Recovery'] as const

const FEATURES = [
  {
    id: 'sessions',
    title: 'Sessions & fuel',
    body: 'Log focus, duration, protein, creatine, meals, and notes in a guided flow — then see them on Home, History, and Calendar.',
  },
  {
    id: 'overload',
    title: 'Progressive overload',
    body: 'Track working weight once, set reps per set (15 · 12 · 10), and see ↑ weight, reps, or volume vs your last log.',
  },
  {
    id: 'rest',
    title: 'Rest counts',
    body: 'One-tap rest days keep the streak honest. Recovery is part of the journal, not an afterthought.',
  },
  {
    id: 'private',
    title: 'Private by design',
    body: 'No public feed. Your rows are yours — Supabase Row Level Security enforces it at the database.',
  },
] as const

/** Phase 1–3 marketing: shell, content, product frames + reveal motion. */
export function MarketingPage() {
  const { preference, resolved, toggleLightDark } = useTheme()

  return (
    <div className="marketing" id="top">
      <MarketingNav
        resolved={resolved}
        preference={preference}
        onThemeCycle={toggleLightDark}
      />

      <main>
        <section className="mkt-hero" aria-labelledby="mkt-hero-title">
          <div className="mkt-hero-glow" aria-hidden />
          <div className="mkt-hero-layout">
            <div className="mkt-hero-copy">
              <p className="mkt-kicker">Training journal</p>
              <h1 id="mkt-hero-title" className="mkt-hero-title">
                {BRAND_LINES.map((line, i) => (
                  <span
                    key={line}
                    className={`mkt-hero-line${i === BRAND_LINES.length - 1 ? ' mkt-hero-line--accent' : ''}`}
                  >
                    {line}
                  </span>
                ))}
              </h1>
              <p className="mkt-hero-sub">{BRAND_PITCH}</p>
              <div className="mkt-hero-actions">
                <Link to="/app" className="mkt-btn mkt-btn--primary mkt-btn--lg">
                  Start free
                </Link>
                <a href="#features" className="mkt-btn mkt-btn--text mkt-btn--lg">
                  See how it works
                  <span className="mkt-btn-chevron" aria-hidden>
                    ›
                  </span>
                </a>
              </div>
              <ul className="mkt-proof" aria-label="What you get">
                {PROOF.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="mkt-hero-device" aria-hidden>
              <PhoneHomeFrame />
            </div>
          </div>
        </section>

        <section id="features" className="mkt-section" aria-labelledby="features-title">
          <div className="mkt-section-inner">
            <Reveal>
              <header className="mkt-section-head">
                <p className="mkt-kicker">Features</p>
                <h2 id="features-title" className="mkt-section-title mkt-section-title--lg">
                  Built for the log, not the noise
                </h2>
                <p className="mkt-section-lead">
                  Everything you need to stay consistent — without turning training into content.
                </p>
              </header>
            </Reveal>
            <ul className="mkt-feature-grid">
              {FEATURES.map((f, i) => (
                <Reveal key={f.id} as="li" className="mkt-feature-card" delayMs={i * 50}>
                  <div className="mkt-feature-mark" aria-hidden />
                  <h3 className="mkt-feature-title">{f.title}</h3>
                  <p className="mkt-feature-body">{f.body}</p>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="progress"
          className="mkt-section mkt-section--spotlight"
          aria-labelledby="progress-title"
        >
          <Reveal className="mkt-section-inner mkt-spotlight">
            <div className="mkt-spotlight-copy">
              <p className="mkt-kicker">Progress</p>
              <h2 id="progress-title" className="mkt-section-title mkt-section-title--lg">
                Load you can trust
              </h2>
              <p className="mkt-section-lead">
                One working weight. Different reps per set. Clear deltas when you move the needle —
                and a volume trend as you log over time.
              </p>
              <ul className="mkt-bullet-list">
                <li>Muscle groups: Chest, Back, Legs, and more</li>
                <li>Shared weight + per-set reps (e.g. 15 · 12 · 10)</li>
                <li>↑ weight / reps / volume vs last save</li>
              </ul>
              <Link to="/app" className="mkt-btn mkt-btn--primary">
                Track a lift →
              </Link>
            </div>
            <div className="mkt-spotlight-visual">
              <PhoneProgressFrame />
            </div>
          </Reveal>
        </section>

        <section id="privacy" className="mkt-section" aria-labelledby="privacy-title">
          <div className="mkt-section-inner mkt-privacy">
            <Reveal>
              <header className="mkt-section-head mkt-section-head--center">
                <p className="mkt-kicker">Privacy</p>
                <h2 id="privacy-title" className="mkt-section-title mkt-section-title--lg">
                  Your journal stays yours
                </h2>
                <p className="mkt-section-lead mkt-section-lead--center">
                  GRIND is a personal app — not a social network. Auth and data sit on Supabase with
                  row-level policies so only your account can read your rows and photos.
                </p>
              </header>
            </Reveal>
            <ul className="mkt-privacy-points">
              {(
                [
                  ['No public profile', 'Nothing is shared by default.'],
                  ['RLS at the database', 'Authorization isn’t “trust the UI.”'],
                  ['Private photo proof', 'Stored in a private bucket, scoped to you.'],
                ] as const
              ).map(([title, body], i) => (
                <Reveal key={title} as="li" delayMs={i * 60}>
                  <strong>{title}</strong>
                  <span>{body}</span>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        <Reveal as="section" className="mkt-final-cta" delayMs={0}>
          <h2 id="mkt-final-title" className="mkt-final-title">
            Ready when you are
          </h2>
          <p className="mkt-final-copy">Sign in and log today — session or rest day.</p>
          <Link to="/app" className="mkt-btn mkt-btn--primary mkt-btn--lg">
            Open GRIND →
          </Link>
        </Reveal>
      </main>

      <footer className="mkt-footer">
        <div className="mkt-footer-inner">
          <div className="mkt-logo mkt-logo--sm">
            GRIND<span>.</span>
          </div>
          <p className="mkt-footer-credit">Developed by Andrew</p>
          <Link to="/app" className="mkt-text-link">
            Open app
          </Link>
        </div>
      </footer>
    </div>
  )
}
