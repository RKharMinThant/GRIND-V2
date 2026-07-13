import { useState, type FormEvent } from 'react'
import type { ThemePreference } from '../lib/theme'
import { isSupabaseConfigured } from '../lib/supabase'
import { ThemeIconButton } from './ThemeControls'

type SignUpResult = { needsEmailConfirmation: boolean; email: string }

type Props = {
  onSignIn: (email: string, password: string) => Promise<void>
  onSignUp: (email: string, password: string, displayName?: string) => Promise<SignUpResult>
  onResendConfirmation: (email: string) => Promise<void>
  authError: string | null
  clearError: () => void
  themePreference: ThemePreference
  resolvedTheme: 'light' | 'dark'
  onThemeCycle: () => void
}

const QUOTES = [
  'Show up. Write it down. Repeat.',
  'Consistency is a skill you train.',
  'Proof lives in the log, not the mood.',
]

export function AuthScreen({
  onSignIn,
  onSignUp,
  onResendConfirmation,
  authError,
  clearError,
  themePreference,
  resolvedTheme,
  onThemeCycle,
}: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null)
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)])

  const error = localError || authError

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    clearError()

    if (mode === 'register') {
      if (password.length < 6) {
        setLocalError('Password must be at least 6 characters')
        return
      }
      if (password !== confirm) {
        setLocalError('Passwords do not match')
        return
      }
    }

    setBusy(true)
    try {
      if (mode === 'login') {
        await onSignIn(email.trim(), password)
      } else {
        const result = await onSignUp(email.trim(), password, displayName.trim() || undefined)
        if (result.needsEmailConfirmation) {
          setConfirmEmail(result.email)
          setResendStatus('idle')
          setPassword('')
          setConfirm('')
        }
      }
    } catch {
      // surfaced via authError
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next: 'login' | 'register') {
    setMode(next)
    setLocalError(null)
    clearError()
    setConfirmEmail(null)
    setResendStatus('idle')
  }

  function goToSignIn() {
    setMode('login')
    setConfirmEmail(null)
    setResendStatus('idle')
    setLocalError(null)
    clearError()
  }

  async function handleResend() {
    if (!confirmEmail) return
    setResendStatus('sending')
    clearError()
    setLocalError(null)
    try {
      await onResendConfirmation(confirmEmail)
      setResendStatus('sent')
    } catch {
      setResendStatus('error')
    }
  }

  return (
    <div className="auth-screen">
      <aside className="auth-brand">
        <div className="auth-brand-mark">
          GRIND<span>.</span>
        </div>
        <div className="auth-brand-quote">
          <p>{quote}</p>
          <span>Personal training journal · private by default</span>
        </div>
        <div style={{ color: 'var(--muted-2)', fontSize: '0.8rem', position: 'relative' }}>
          Powered by your Supabase project
        </div>
      </aside>

      <div className="auth-form-side">
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div className="theme-auth-row">
            <ThemeIconButton
              resolved={resolvedTheme}
              preference={themePreference}
              onCycle={onThemeCycle}
            />
          </div>
          {!isSupabaseConfigured && (
            <div className="config-banner">
              Supabase is not configured. Copy <code>.env.example</code> to <code>.env.local</code> and add
              your project URL + anon key.
            </div>
          )}

          <div className="auth-card">
            <div className="auth-logo-mobile">
              GRIND<span>.</span>
            </div>
            <div className="auth-tag">Performance journal for sessions & fuel.</div>

            {confirmEmail ? (
              <div className="confirm-panel" role="status">
                <div className="confirm-icon" aria-hidden>
                  ✉
                </div>
                <h2 className="confirm-title">Confirm your email</h2>
                <p className="confirm-body">
                  We sent a confirmation link to <strong className="confirm-email">{confirmEmail}</strong>.
                </p>
                <ol className="confirm-steps">
                  <li>Open your inbox (check spam if needed)</li>
                  <li>Click the confirmation link from Supabase</li>
                  <li>Return here and sign in</li>
                </ol>
                {error && <div className="auth-error">{error}</div>}
                {resendStatus === 'sent' && (
                  <div className="confirm-success">Confirmation email resent. Check your inbox again.</div>
                )}
                <button type="button" className="btn btn-primary btn-full btn-lg" onClick={goToSignIn}>
                  I confirmed — Sign In →
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-full"
                  style={{ marginTop: 10 }}
                  onClick={() => void handleResend()}
                  disabled={resendStatus === 'sending'}
                >
                  {resendStatus === 'sending' ? 'Sending…' : 'Resend confirmation email'}
                </button>
                <p className="auth-footer" style={{ marginTop: 16 }}>
                  Wrong address?{' '}
                  <button type="button" className="link-btn" onClick={() => switchMode('register')}>
                    Create account again
                  </button>
                </p>
              </div>
            ) : (
              <>
                <div className="auth-tabs">
                  <button
                    type="button"
                    className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
                    onClick={() => switchMode('login')}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
                    onClick={() => switchMode('register')}
                  >
                    Create Account
                  </button>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleSubmit}>
                  {mode === 'register' && (
                    <div className="field">
                      <label htmlFor="displayName">Display name</label>
                      <input
                        id="displayName"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="How you show up"
                        autoComplete="nickname"
                      />
                    </div>
                  )}

                  <div className="field">
                    <label htmlFor="email">Email</label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@email.com"
                      autoComplete="email"
                      required
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="password">Password</label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'register' ? 'min 6 characters' : '••••••••'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      required
                      minLength={6}
                    />
                  </div>

                  {mode === 'register' && (
                    <div className="field">
                      <label htmlFor="confirm">Confirm password</label>
                      <input
                        id="confirm"
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="repeat password"
                        autoComplete="new-password"
                        required
                      />
                    </div>
                  )}

                  <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy}>
                    {busy ? 'Please wait…' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
                  </button>
                </form>

                <div className="auth-footer">
                  Private logs · photo proof · streaks that stick.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
