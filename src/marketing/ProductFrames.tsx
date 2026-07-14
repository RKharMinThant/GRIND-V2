/** CSS product frames for marketing (no screenshots required). */

export function PhoneHomeFrame() {
  return (
    <div className="mkt-device mkt-device--phone" aria-hidden>
      <div className="mkt-device-bezel">
        <div className="mkt-device-notch" />
        <div className="mkt-device-screen mkt-screen-home">
          <div className="mkt-screen-bar">
            <span className="mkt-screen-logo">
              GRIND<span>.</span>
            </span>
            <span className="mkt-screen-dot" />
          </div>
          <div className="mkt-screen-greeting">Good evening</div>
          <div className="mkt-screen-hero">
            <div>
              <div className="mkt-screen-label">Streak</div>
              <div className="mkt-screen-streak">12</div>
            </div>
            <div className="mkt-screen-ring" />
          </div>
          <div className="mkt-screen-actions">
            <span className="mkt-screen-pill mkt-screen-pill--lime">+ Log</span>
            <span className="mkt-screen-pill">Rest day</span>
          </div>
          <div className="mkt-screen-card mkt-screen-card--rest">
            <span className="mkt-screen-card-kicker">Recovery</span>
            <span className="mkt-screen-card-title">Rest day</span>
          </div>
          <div className="mkt-screen-dock">
            <span className="is-on" />
            <span />
            <span className="mkt-screen-dock-plus">+</span>
            <span />
            <span />
          </div>
        </div>
      </div>
    </div>
  )
}

export function PhoneProgressFrame() {
  return (
    <div className="mkt-device mkt-device--phone" aria-hidden>
      <div className="mkt-device-bezel">
        <div className="mkt-device-notch" />
        <div className="mkt-device-screen mkt-screen-progress">
          <div className="mkt-screen-bar">
            <span className="mkt-screen-title">Progress</span>
            <span className="mkt-screen-pill mkt-screen-pill--lime mkt-screen-pill--sm">+ Add</span>
          </div>
          <div className="mkt-screen-group">
            <div className="mkt-screen-group-head">Chest · 2</div>
            <div className="mkt-screen-lift">
              <div>
                <div className="mkt-screen-lift-name">Bench Press</div>
                <div className="mkt-screen-lift-nums">
                  <span className="up">↑</span> 3×8 @ 60kg
                </div>
              </div>
              <span className="mkt-screen-badge">+2.5 kg</span>
            </div>
            <div className="mkt-screen-lift">
              <div>
                <div className="mkt-screen-lift-name">Incline Press</div>
                <div className="mkt-screen-lift-nums">15 · 12 · 10 @ 30kg</div>
              </div>
              <span className="mkt-screen-badge mkt-screen-badge--hold">Hold</span>
            </div>
          </div>
          <div className="mkt-screen-chart">
            <div style={{ height: '40%' }} />
            <div style={{ height: '55%' }} />
            <div style={{ height: '48%' }} />
            <div style={{ height: '72%' }} />
            <div style={{ height: '88%' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
