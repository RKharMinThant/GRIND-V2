import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ThemePreference } from '../lib/theme'
import { ThemeIconButton, ThemeSegment } from './ThemeControls'

export type Tab = 'home' | 'history' | 'progress' | 'calendar'

type Props = {
  tab: Tab
  displayName: string
  weeklyGoal: number
  themePreference: ThemePreference
  resolvedTheme: 'light' | 'dark'
  onThemeChange: (pref: ThemePreference) => void
  onThemeCycle: () => void
  onTab: (t: Tab) => void
  onSignOut: () => void
  onNewLog: () => void
  onUpdateProfile: (patch: { display_name?: string; weekly_goal?: number }) => Promise<void>
  children: ReactNode
}

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
    </svg>
  )
}

function IconHistory() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  )
}

function IconProgress() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  )
}

export function Shell({
  tab,
  displayName,
  weeklyGoal,
  themePreference,
  resolvedTheme,
  onThemeChange,
  onThemeCycle,
  onTab,
  onSignOut,
  onNewLog,
  onUpdateProfile,
  children,
}: Props) {
  const initial = (displayName[0] || 'G').toUpperCase()
  const [menuOpen, setMenuOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState(displayName)
  const [goalDraft, setGoalDraft] = useState(String(weeklyGoal))
  const [saving, setSaving] = useState(false)
  const [menuError, setMenuError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setNameDraft(displayName)
    setGoalDraft(String(weeklyGoal))
  }, [displayName, weeklyGoal])

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  async function saveProfile() {
    setSaving(true)
    setMenuError(null)
    try {
      const goal = Math.min(14, Math.max(1, Number(goalDraft) || 4))
      await onUpdateProfile({
        display_name: nameDraft.trim() || displayName,
        weekly_goal: goal,
      })
      setMenuOpen(false)
    } catch (e) {
      setMenuError(e instanceof Error ? e.message : 'Could not save. Run migration 002 if needed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="logo">
          GRIND<span>.</span>
        </div>
        <div className="topbar-right">
          <ThemeIconButton
            resolved={resolvedTheme}
            preference={themePreference}
            onCycle={onThemeCycle}
          />
          <div className="user-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="user-chip"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <div className="avatar">{initial}</div>
              <span>{displayName}</span>
            </button>
            {menuOpen && (
              <div className="menu-pop" role="menu">
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>Appearance</label>
                </div>
                <ThemeSegment preference={themePreference} onChange={onThemeChange} />
                <div className="field">
                  <label htmlFor="profileName">Display name</label>
                  <input
                    id="profileName"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    maxLength={40}
                  />
                </div>
                <div className="field">
                  <label htmlFor="weeklyGoal">Weekly session goal</label>
                  <input
                    id="weeklyGoal"
                    type="number"
                    min={1}
                    max={14}
                    value={goalDraft}
                    onChange={(e) => setGoalDraft(e.target.value)}
                  />
                </div>
                {menuError && <div className="auth-error">{menuError}</div>}
                <div className="menu-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-full"
                    onClick={() => void saveProfile()}
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Save profile'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-full"
                    onClick={() => {
                      setMenuOpen(false)
                      onSignOut()
                    }}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">{children}</main>

      {/* 5-up: Home · History · Log · Progress · Calendar */}
      <div className="dock-wrap">
        <nav className="dock-bar dock-bar--five" aria-label="Main">
          <button
            type="button"
            className={`dock-slot ${tab === 'home' ? 'active' : ''}`}
            onClick={() => onTab('home')}
            aria-current={tab === 'home' ? 'page' : undefined}
          >
            <span className="dock-slot-icon">
              <IconHome />
            </span>
            <span className="dock-slot-label">Home</span>
          </button>

          <button
            type="button"
            className={`dock-slot ${tab === 'history' ? 'active' : ''}`}
            onClick={() => onTab('history')}
            aria-current={tab === 'history' ? 'page' : undefined}
          >
            <span className="dock-slot-icon">
              <IconHistory />
            </span>
            <span className="dock-slot-label">History</span>
          </button>

          <div className="dock-log-wrap">
            <button
              type="button"
              className="dock-log"
              onClick={onNewLog}
              title="Log session"
              aria-label="Log session"
            >
              <span className="dock-log-plus" aria-hidden>
                +
              </span>
            </button>
            <span className="dock-log-caption">Log</span>
          </div>

          <button
            type="button"
            className={`dock-slot ${tab === 'progress' ? 'active' : ''}`}
            onClick={() => onTab('progress')}
            aria-current={tab === 'progress' ? 'page' : undefined}
          >
            <span className="dock-slot-icon">
              <IconProgress />
            </span>
            <span className="dock-slot-label">Progress</span>
          </button>

          <button
            type="button"
            className={`dock-slot ${tab === 'calendar' ? 'active' : ''}`}
            onClick={() => onTab('calendar')}
            aria-current={tab === 'calendar' ? 'page' : undefined}
          >
            <span className="dock-slot-icon">
              <IconCalendar />
            </span>
            <span className="dock-slot-label">Calendar</span>
          </button>
        </nav>
      </div>
    </div>
  )
}
