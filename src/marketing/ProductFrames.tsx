import type { ReactNode } from 'react'
import frameSrc from '../assets/iphone-frame-portrait.png'

/**
 * Real device chrome (src/assets/iphone-frame-portrait.png) over a screen layer.
 * Screen insets measured from the PNG transparent hole.
 */
function PhoneChrome({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mkt-device ${className}`.trim()} aria-hidden>
      <div className="mkt-device-stage">
        <div className="mkt-device-screen">
          <div className="mkt-status-bar">
            <span className="mkt-status-time">9:41</span>
            <span className="mkt-status-trail">
              <span className="mkt-status-signal" />
              <span className="mkt-status-wifi" />
              <span className="mkt-status-battery" />
            </span>
          </div>
          <div className="mkt-screen-body">{children}</div>
          <div className="mkt-home-indicator" />
        </div>
        <img
          className="mkt-device-frame"
          src={frameSrc}
          alt=""
          width={502}
          height={1036}
          draggable={false}
        />
      </div>
    </div>
  )
}

export function PhoneHomeFrame() {
  return (
    <PhoneChrome className="mkt-device--home">
      <div className="mkt-screen-home">
        <div className="mkt-screen-eyebrow">Tue, Jul 14</div>
        <div className="mkt-screen-greeting">
          Good evening, <em>Andrew</em>
        </div>

        <div className="mkt-screen-hero">
          <div className="mkt-screen-hero-main">
            <div className="mkt-screen-label">Current streak</div>
            <div className="mkt-screen-streak">12</div>
            <p className="mkt-screen-hero-note">12 days locked in.</p>
          </div>
          <div className="mkt-screen-ring-wrap">
            <div className="mkt-screen-ring" />
            <span className="mkt-screen-ring-label">
              4<span>/5</span>
            </span>
          </div>
          <div className="mkt-screen-actions">
            <span className="mkt-screen-badge-live">
              <span className="mkt-screen-live-dot" />
              Today open
            </span>
            <span className="mkt-screen-pill mkt-screen-pill--lime">+ Log session</span>
            <span className="mkt-screen-pill">Rest day</span>
          </div>
        </div>

        <div className="mkt-screen-week">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={`${d}-${i}`} className={`mkt-screen-day${i < 4 || i === 5 ? ' is-done' : ''}${i === 1 ? ' is-today' : ''}`}>
              <span>{d}</span>
              <i />
            </div>
          ))}
        </div>

        <div className="mkt-screen-card mkt-screen-card--rest">
          <span className="mkt-screen-card-kicker">Recovery</span>
          <span className="mkt-screen-card-title">Rest day</span>
          <span className="mkt-screen-card-meta">Yesterday · streak held</span>
        </div>

        <div className="mkt-screen-dock">
          <span className="is-on" />
          <span />
          <span className="mkt-screen-dock-plus">+</span>
          <span />
          <span />
        </div>
      </div>
    </PhoneChrome>
  )
}

export function PhoneProgressFrame() {
  return (
    <PhoneChrome className="mkt-device--progress">
      <div className="mkt-screen-progress">
        <div className="mkt-screen-bar">
          <div>
            <div className="mkt-screen-title">Progress</div>
            <div className="mkt-screen-sub">Working sets by muscle</div>
          </div>
          <span className="mkt-screen-pill mkt-screen-pill--lime mkt-screen-pill--sm">Add lift</span>
        </div>

        <div className="mkt-screen-chart-block">
          <div className="mkt-screen-chart-label">Last 4 weeks</div>
          <div className="mkt-screen-chart">
            {[
              { h: 42, n: 3, l: 'W1' },
              { h: 58, n: 4, l: 'W2' },
              { h: 50, n: 3, l: 'W3' },
              { h: 86, n: 5, l: 'W4' },
            ].map((b) => (
              <div key={b.l} className="mkt-screen-chart-col">
                <div className="mkt-screen-chart-track">
                  <div className="mkt-screen-chart-fill" style={{ height: `${b.h}%` }} />
                </div>
                <span className="mkt-screen-chart-n">{b.n}</span>
                <span className="mkt-screen-chart-l">{b.l}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mkt-screen-group">
          <div className="mkt-screen-group-head">
            <span>Chest</span>
            <span className="mkt-screen-group-count">2</span>
          </div>
          <div className="mkt-screen-lift">
            <div>
              <div className="mkt-screen-lift-name">Bench Press</div>
              <div className="mkt-screen-lift-nums">
                <span className="up">↑</span> 3×8 @ 60 kg
              </div>
              <div className="mkt-screen-lift-when">2d ago</div>
            </div>
            <span className="mkt-screen-badge">+2.5 kg</span>
          </div>
          <div className="mkt-screen-lift">
            <div>
              <div className="mkt-screen-lift-name">Incline Press</div>
              <div className="mkt-screen-lift-nums">15 · 12 · 10 @ 30 kg</div>
              <div className="mkt-screen-lift-when">Today</div>
            </div>
            <span className="mkt-screen-badge mkt-screen-badge--hold">Hold</span>
          </div>
        </div>

        <div className="mkt-screen-group mkt-screen-group--dim">
          <div className="mkt-screen-group-head">
            <span>Back</span>
            <span className="mkt-screen-group-count">1</span>
          </div>
          <div className="mkt-screen-lift">
            <div>
              <div className="mkt-screen-lift-name">Lat Pulldown</div>
              <div className="mkt-screen-lift-nums">
                <span className="up">↑</span> 3×10 @ 45 kg
              </div>
            </div>
            <span className="mkt-screen-badge">+5 kg</span>
          </div>
        </div>
      </div>
    </PhoneChrome>
  )
}
